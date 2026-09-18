// Proves the 2026-09-13 Billing Ops operator-control hardening (updated
// 2026-09-18 for the restored 28->28 cutoff model):
// 1. Manual "בחר חודש" (createPeriodForMonth) and the automatic monthly job
//    (billing-monthly-cycle.job.js) converge on the EXACT SAME
//    billing_periods row for the same selected month -- no duplicate
//    periods, ever, regardless of which path runs first.
// 2. createPeriodForMonth is idempotent: selecting the same month twice
//    returns the same period, never creates a second row.
// 3. calculatePeriod now refuses a second calculation for a period that
//    already has a billing_run (PERIOD_ALREADY_CALCULATED), closing the
//    gap the old "חשב מחדש" confirm-dialog left open -- runProductionCalculation
//    itself is untouched (still callable directly, still has no such
//    guard by design; the guard lives in the caller, same layer the
//    automatic job's own guard has always lived in).
//
// Uses a far-future, uniquely-tagged month (2098-08) so this can never
// collide with a real production billing_period or with the other
// live-fixture scripts' own reserved far-future windows (2099-06, 2099-07).
//
// Moved from 2099-08 to 2098-08 on 2026-09-17: an explicitly authorized
// real Donation-Engine-to-Billing-calculation E2E test permanently
// occupies 2099-08 now (one real, is_mock=false donation -> real
// calculation -> a genuine Statement/statement_component -- deliberately
// left in place forever, tagged ZZZ_TEST_DONATION_BILLING_E2E_2026-09-17;
// see that conversation's own report for the full permanent chain and
// why none of it can be deleted). This script's OWN period/run/audit-log
// rows were always meant to be transient (see cleanup() below) -- moving
// the reserved month is the correct fix, not touching the now-permanent
// E2E data.
//
// Run: node scripts/test-billing-ops-manual-month-calculation.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const billingOpsService = require('../src/modules/platform/billing-ops/billing-ops.service');
const monthlyCycleJob = require('../src/jobs/billing-monthly-cycle.job');
const { resolveSelectedMonthBoundary } = require('../src/modules/billing-engine/billing-period.util');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const SUPER_ADMIN_USER_ID = 17; // test-scoped-admin@example.com -- same fixture actor other live-fixture scripts use
const YEAR = 2098;
const MONTH = 8; // August -- far-future, reserved for this script only

let periodId = null;

// Deterministic audit-log cleanup fix (2026-09-14k). The old version
// matched by text (LIKE '%2098-08%' for billing_period_create, LIKE
// '%<this run's periodId>%' for billing_calculation_trigger) -- the second
// pattern only ever matches the CURRENT run's own periodId, so a prior
// run's billing_calculation_trigger row (a different periodId each time,
// since createPeriodForMonth always gets a fresh UUID after the previous
// run's billing_periods row was deleted) was silently left behind forever.
// That's exactly how two orphaned rows from 2026-09-13 accumulated (found
// via a read-only audit, confirmed to reference billing_period ids that no
// longer exist, then deleted once by hand -- see the commit this comment
// ships in). Fixed by bookmarking platform_audit_log's max id before this
// run does anything, then deleting only rows with a HIGHER id AND one of
// this script's own two action values -- an id-range bookmark, not text
// matching, so it can only ever catch what THIS run itself created and
// cannot touch unrelated audit data (including a concurrent run, if one
// somehow started later and got a higher id -- this run's bookmark predates it).
let startAuditId = 0;
let billingRunId = null;

async function cleanup() {
  await pool.query(
    `DELETE FROM platform_audit_log
     WHERE id > $1 AND action IN ('billing_period_create', 'billing_calculation_trigger')`,
    [startAuditId]
  );
  if (!periodId) return;
  await pool.query(`DELETE FROM billing_runs WHERE billing_period_id = $1`, [periodId]);
  await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [periodId]);
}

async function main() {
  const bookmark = await pool.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM platform_audit_log`);
  startAuditId = Number(bookmark.rows[0].max_id);

  try {
    await check('1. resolveSelectedMonthBoundary(2098, 8) matches what the automatic job would compute if "now" were just after that cycle\'s cutoff', async () => {
      const manual = await resolveSelectedMonthBoundary(pool, YEAR, MONTH);
      const automatic = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2098-08-29T00:00:00Z'));
      assert.strictEqual(manual.periodStart.getTime(), automatic.periodStart.getTime());
      assert.strictEqual(manual.periodEnd.getTime(), automatic.periodEnd.getTime());
      assert.strictEqual(manual.periodStart.toISOString(), '2098-07-28T17:00:00.000Z');
      assert.strictEqual(manual.periodEnd.toISOString(), '2098-08-28T17:00:00.000Z');
    });

    await check('2. createPeriodForMonth(2098, 8) creates a new period', async () => {
      const { period, created } = await billingOpsService.createPeriodForMonth({
        year: YEAR, month: MONTH, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      assert.strictEqual(created, true);
      periodId = period.id;
      assert.strictEqual(new Date(period.period_start).toISOString(), '2098-07-28T17:00:00.000Z');
      assert.strictEqual(new Date(period.period_end).toISOString(), '2098-08-28T17:00:00.000Z');
    });

    await check('3. createPeriodForMonth(2098, 8) called again returns the SAME period, does not create a duplicate', async () => {
      const { period, created } = await billingOpsService.createPeriodForMonth({
        year: YEAR, month: MONTH, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      assert.strictEqual(created, false);
      assert.strictEqual(period.id, periodId);

      const { rows } = await pool.query(
        `SELECT count(*) FROM billing_periods WHERE period_start = '2098-07-28T17:00:00.000Z' AND period_end = '2098-08-28T17:00:00.000Z'`
      );
      assert.strictEqual(Number(rows[0].count), 1, 'exactly one billing_periods row must exist for this cycle');
    });

    await check('4. an audit-log entry was written only once (for the actual creation, not the idempotent second call)', async () => {
      const { rows } = await pool.query(
        `SELECT count(*) FROM platform_audit_log WHERE id > $1 AND action = 'billing_period_create'`,
        [startAuditId]
      );
      assert.strictEqual(Number(rows[0].count), 1);
    });

    await check('5. calculatePeriod runs successfully the first time (creates a billing_run via the real production engine)', async () => {
      const result = await billingOpsService.calculatePeriod({
        periodId, asOf: '2098-08-15T00:00:00.000Z', superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      assert.ok(result.billingRunId);
      billingRunId = result.billingRunId;

      const { rows } = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [periodId]);
      assert.strictEqual(Number(rows[0].count), 1);
    });

    await check('6. calculatePeriod called again for the same period is refused with PERIOD_ALREADY_CALCULATED, no second billing_run', async () => {
      let threw = null;
      try {
        await billingOpsService.calculatePeriod({
          periodId, asOf: '2098-08-20T00:00:00.000Z', superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
        });
      } catch (err) {
        threw = err;
      }
      assert.ok(threw, 'a second calculatePeriod call must throw');
      assert.strictEqual(threw.code, 'PERIOD_ALREADY_CALCULATED');

      const { rows } = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [periodId]);
      assert.strictEqual(Number(rows[0].count), 1, 'still exactly one billing_run -- the refused call must not have created a second one');
    });

    await check('7. the automatic job itself also refuses to recalculate the same period (its own pre-existing guard, unaffected by this change)', async () => {
      const result = await monthlyCycleJob.handler(pool, { now: new Date(Date.UTC(2098, 8, 15)) }); // targets August 2098, same period
      assert.strictEqual(result.periodId, periodId, 'the job must resolve to the SAME period the manual selector created');
      assert.strictEqual(result.calculationRan, false);
      assert.strictEqual(result.reason, 'already_calculated');

      const { rows } = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [periodId]);
      assert.strictEqual(Number(rows[0].count), 1, 'still exactly one billing_run after the automatic job also declined to recalculate');
    });
  } finally {
    await cleanup();
  }

  await check('cleanup verification: zero residue -- billing period, billing run, statements/components, and every audit row this run created are all gone', async () => {
    const period = await pool.query(`SELECT count(*) FROM billing_periods WHERE period_start = '2098-07-28T17:00:00.000Z' AND period_end = '2098-08-28T17:00:00.000Z'`);
    assert.strictEqual(Number(period.rows[0].count), 0, 'billing_periods residue');

    assert.ok(periodId, 'sanity: the period must have been created earlier in this run for the checks below to mean anything');
    const run = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [periodId]);
    assert.strictEqual(Number(run.rows[0].count), 0, 'billing_runs residue');

    // No real donation was ever eligible in the far-future 2098-08 window
    // (see this file's own header comment), so calculateAccountStatement's
    // zero-activity path never wrote either table for this run's
    // billing_run_id -- re-affirms the invariant directly rather than only
    // inferring it from statementsCreated=0 in check 5's return value.
    assert.ok(billingRunId, 'sanity: calculatePeriod must have returned a billingRunId earlier in this run');
    const stmts = await pool.query(`SELECT count(*) FROM statements WHERE billing_run_id = $1`, [billingRunId]);
    assert.strictEqual(Number(stmts.rows[0].count), 0, 'statements residue');
    const comps = await pool.query(
      `SELECT count(*) FROM statement_components sc JOIN statements s ON s.id = sc.statement_id WHERE s.billing_run_id = $1`,
      [billingRunId]
    );
    assert.strictEqual(Number(comps.rows[0].count), 0, 'statement_components residue');

    const auditResidue = await pool.query(
      `SELECT count(*) FROM platform_audit_log WHERE id > $1 AND action IN ('billing_period_create', 'billing_calculation_trigger')`,
      [startAuditId]
    );
    assert.strictEqual(Number(auditResidue.rows[0].count), 0, 'platform_audit_log residue for this run');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  try { await cleanup(); } catch {}
  await pool.end();
  process.exit(1);
});
