// Proves the 2026-09-13 Billing Ops operator-control hardening:
// 1. Manual "בחר חודש" (createPeriodForMonth) and the automatic monthly job
//    (billing-monthly-cycle.job.js) converge on the EXACT SAME
//    billing_periods row for the same calendar month -- no duplicate
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
// Uses a far-future, uniquely-tagged month (2099-08) so this can never
// collide with a real production billing_period or with the other
// live-fixture scripts' own reserved far-future windows (2099-06, 2099-07).
//
// Run: node scripts/test-billing-ops-manual-month-calculation.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const billingOpsService = require('../src/modules/platform/billing-ops/billing-ops.service');
const monthlyCycleJob = require('../src/jobs/billing-monthly-cycle.job');
const { computeCalendarMonthUtcBoundary } = require('../src/modules/billing-engine/billing-period.util');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const SUPER_ADMIN_USER_ID = 17; // test-scoped-admin@example.com -- same fixture actor other live-fixture scripts use
const YEAR = 2099;
const MONTH = 8; // August -- far-future, reserved for this script only

let periodId = null;

async function cleanup() {
  await pool.query(
    `DELETE FROM platform_audit_log WHERE action = 'billing_period_create' AND notes LIKE '%2099-08%'`
  );
  await pool.query(
    `DELETE FROM platform_audit_log WHERE action = 'billing_calculation_trigger' AND notes LIKE '%' || $1 || '%'`,
    [periodId || '__none__']
  );
  if (!periodId) return;
  await pool.query(`DELETE FROM billing_runs WHERE billing_period_id = $1`, [periodId]);
  await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [periodId]);
}

async function main() {
  try {
    await check('1. computeCalendarMonthUtcBoundary(2099, 8) matches what the automatic job would compute if "now" were September 2099', async () => {
      const manual = computeCalendarMonthUtcBoundary(YEAR, MONTH);
      const automatic = monthlyCycleJob.computePreviousMonthUtcBoundary(new Date(Date.UTC(2099, 8, 15))); // September 2099
      assert.strictEqual(manual.periodStart.getTime(), automatic.periodStart.getTime());
      assert.strictEqual(manual.periodEnd.getTime(), automatic.periodEnd.getTime());
      assert.strictEqual(manual.periodStart.toISOString(), '2099-08-01T00:00:00.000Z');
      assert.strictEqual(manual.periodEnd.toISOString(), '2099-09-01T00:00:00.000Z');
    });

    await check('2. createPeriodForMonth(2099, 8) creates a new period', async () => {
      const { period, created } = await billingOpsService.createPeriodForMonth({
        year: YEAR, month: MONTH, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      assert.strictEqual(created, true);
      periodId = period.id;
      assert.strictEqual(new Date(period.period_start).toISOString(), '2099-08-01T00:00:00.000Z');
    });

    await check('3. createPeriodForMonth(2099, 8) called again returns the SAME period, does not create a duplicate', async () => {
      const { period, created } = await billingOpsService.createPeriodForMonth({
        year: YEAR, month: MONTH, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      assert.strictEqual(created, false);
      assert.strictEqual(period.id, periodId);

      const { rows } = await pool.query(
        `SELECT count(*) FROM billing_periods WHERE period_start = '2099-08-01T00:00:00.000Z'`
      );
      assert.strictEqual(Number(rows[0].count), 1, 'exactly one billing_periods row must exist for August 2099');
    });

    await check('4. an audit-log entry was written only once (for the actual creation, not the idempotent second call)', async () => {
      const { rows } = await pool.query(
        `SELECT count(*) FROM platform_audit_log WHERE action = 'billing_period_create' AND notes LIKE '%2099-08%'`
      );
      assert.strictEqual(Number(rows[0].count), 1);
    });

    await check('5. calculatePeriod runs successfully the first time (creates a billing_run via the real production engine)', async () => {
      const result = await billingOpsService.calculatePeriod({
        periodId, asOf: '2099-08-15T00:00:00.000Z', superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
      });
      assert.ok(result.billingRunId);

      const { rows } = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [periodId]);
      assert.strictEqual(Number(rows[0].count), 1);
    });

    await check('6. calculatePeriod called again for the same period is refused with PERIOD_ALREADY_CALCULATED, no second billing_run', async () => {
      let threw = null;
      try {
        await billingOpsService.calculatePeriod({
          periodId, asOf: '2099-08-20T00:00:00.000Z', superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
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
      const result = await monthlyCycleJob.handler(pool, { now: new Date(Date.UTC(2099, 8, 15)) }); // targets August 2099, same period
      assert.strictEqual(result.periodId, periodId, 'the job must resolve to the SAME period the manual selector created');
      assert.strictEqual(result.calculationRan, false);
      assert.strictEqual(result.reason, 'already_calculated');

      const { rows } = await pool.query(`SELECT count(*) FROM billing_runs WHERE billing_period_id = $1`, [periodId]);
      assert.strictEqual(Number(rows[0].count), 1, 'still exactly one billing_run after the automatic job also declined to recalculate');
    });
  } finally {
    await cleanup();
  }

  await check('cleanup verification: zero residue -- the fixture period is gone', async () => {
    const { rows } = await pool.query(`SELECT count(*) FROM billing_periods WHERE period_start = '2099-08-01T00:00:00.000Z'`);
    assert.strictEqual(Number(rows[0].count), 0);
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
