// Proves the 2026-09-18 forward guard added to billing-ops.service.js
// #calculatePeriod: the manual Super Admin "חשב חיובים" action must refuse
// to calculate a period whose period_end has not actually passed yet (real
// wall-clock time), exactly like the automatic monthly job already refuses
// to target a cycle whose cutoff hasn't happened yet. Before this fix, a
// manual early calculation created a real billing_run, which
// PERIOD_ALREADY_CALCULATED then locked forever -- any donation arriving
// afterward but still inside that same calendar window became permanently
// uncalculable through any normal flow (found via a real donation E2E,
// 2026-09-18).
//
// Two disjoint, uniquely-tagged fixture months, chosen so they can never
// collide with real Hamonym billing history or with the other live-fixture
// scripts' own reserved windows (2098-08, 2099-06/07/08):
//   - 1999-08 (real past relative to any conceivable "now" this suite runs
//     under) -- proves a genuinely closed period still calculates normally,
//     and that PERIOD_ALREADY_CALCULATED still fires on top of the new guard.
//   - 2098-09 (real future) -- proves an open period is hard-rejected with
//     PERIOD_NOT_YET_CLOSED, with zero billing_run created.
//
// Run: node scripts/test-billing-manual-calc-period-not-closed-guard.js

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

const PAST_YEAR = 1999;
const PAST_MONTH = 8;
const FUTURE_YEAR = 2098;
const FUTURE_MONTH = 9; // distinct from test-billing-ops-manual-month-calculation.js's reserved 2098-08

let pastPeriodId = null;
let futurePeriodId = null;
let startAuditId = 0;

async function cleanup() {
  await pool.query(
    `DELETE FROM platform_audit_log
     WHERE id > $1 AND action IN ('billing_period_create', 'billing_calculation_trigger')`,
    [startAuditId]
  );
  if (pastPeriodId) {
    await pool.query(`DELETE FROM statement_components WHERE statement_id IN (SELECT id FROM statements WHERE billing_run_id IN (SELECT id FROM billing_runs WHERE billing_period_id = $1))`, [pastPeriodId]);
    await pool.query(`DELETE FROM statements WHERE billing_run_id IN (SELECT id FROM billing_runs WHERE billing_period_id = $1)`, [pastPeriodId]);
    await pool.query(`DELETE FROM billing_runs WHERE billing_period_id = $1`, [pastPeriodId]);
    await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [pastPeriodId]);
  }
  if (futurePeriodId) {
    await pool.query(`DELETE FROM billing_runs WHERE billing_period_id = $1`, [futurePeriodId]);
    await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [futurePeriodId]);
  }
}

async function main() {
  const bookmark = await pool.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM platform_audit_log`);
  startAuditId = Number(bookmark.rows[0].max_id);

  try {
    await check('setup: create the past (1999-08) and future (2098-09) fixture periods', async () => {
      const past = await resolveSelectedMonthBoundary(pool, PAST_YEAR, PAST_MONTH);
      const pastRes = await billingOpsService.createPeriodForMonth({
        year: PAST_YEAR, month: PAST_MONTH, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      pastPeriodId = pastRes.period.id;
      assert.ok(new Date(pastRes.period.period_end).getTime() <= Date.now(), 'sanity: fixture period_end must genuinely be in the past');

      const futureRes = await billingOpsService.createPeriodForMonth({
        year: FUTURE_YEAR, month: FUTURE_MONTH, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      futurePeriodId = futureRes.period.id;
      assert.ok(new Date(futureRes.period.period_end).getTime() > Date.now(), 'sanity: fixture period_end must genuinely be in the future');
    });

    await check('an OPEN period (period_end in the future) is rejected with PERIOD_NOT_YET_CLOSED, no billing_run created', async () => {
      let threw = null;
      try {
        await billingOpsService.calculatePeriod({
          periodId: futurePeriodId, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
        });
      } catch (err) { threw = err; }
      assert.ok(threw, 'calculating an open period must throw');
      assert.strictEqual(threw.code, 'PERIOD_NOT_YET_CLOSED');

      const { rows } = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [futurePeriodId]);
      assert.strictEqual(Number(rows[0].count), 0, 'a rejected calculation must not create a billing_run');
    });

    await check('a CLOSED period (period_end already passed) calculates normally, exactly as before this fix', async () => {
      const result = await billingOpsService.calculatePeriod({
        periodId: pastPeriodId, asOf: '1999-08-29T00:00:00.000Z', superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      assert.ok(result.billingRunId);

      const { rows } = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [pastPeriodId]);
      assert.strictEqual(Number(rows[0].count), 1);
    });

    await check('PERIOD_ALREADY_CALCULATED still fires unchanged on top of the new guard, for that same now-closed period', async () => {
      let threw = null;
      try {
        await billingOpsService.calculatePeriod({
          periodId: pastPeriodId, asOf: '1999-09-01T00:00:00.000Z', superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
        });
      } catch (err) { threw = err; }
      assert.ok(threw, 'a second calculatePeriod call on an already-calculated closed period must still throw');
      assert.strictEqual(threw.code, 'PERIOD_ALREADY_CALCULATED');

      const { rows } = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [pastPeriodId]);
      assert.strictEqual(Number(rows[0].count), 1, 'still exactly one billing_run');
    });

    await check('calculating a non-existent period id is rejected with BILLING_PERIOD_NOT_FOUND, not a raw SQL/undefined error', async () => {
      let threw = null;
      try {
        await billingOpsService.calculatePeriod({
          periodId: '00000000-0000-0000-0000-000000000000', superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
        });
      } catch (err) { threw = err; }
      assert.ok(threw);
      assert.strictEqual(threw.code, 'BILLING_PERIOD_NOT_FOUND');
    });

    await check('the automatic monthly job is structurally unaffected -- it calls the calculation engine directly, not through the new-guarded calculatePeriod, and still correctly refuses to target the still-open future period', async () => {
      const result = await monthlyCycleJob.handler(pool, { now: new Date(Date.UTC(FUTURE_YEAR, FUTURE_MONTH - 2, 15)) }); // well before the 2098-09 cutoff
      // The job's own guard falls back to the PREVIOUS cycle instead of the still-open one -- it must never resolve to our still-open future fixture period.
      assert.notStrictEqual(result.periodId, futurePeriodId, 'the job must never target a period that has not closed yet');
    });
  } finally {
    await cleanup();
  }

  await check('cleanup verification: zero residue for both fixture periods and their audit rows', async () => {
    assert.ok(pastPeriodId && futurePeriodId, 'sanity: both fixtures must have been created earlier in this run');
    const past = await pool.query(`SELECT count(*) FROM billing_periods WHERE id = $1`, [pastPeriodId]);
    assert.strictEqual(Number(past.rows[0].count), 0, 'past billing_periods residue');
    const future = await pool.query(`SELECT count(*) FROM billing_periods WHERE id = $1`, [futurePeriodId]);
    assert.strictEqual(Number(future.rows[0].count), 0, 'future billing_periods residue');

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
