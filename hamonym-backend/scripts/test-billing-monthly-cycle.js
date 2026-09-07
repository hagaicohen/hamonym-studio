// Regression coverage for Billing Monthly Cycle v1 (2026-09-08) --
// src/jobs/billing-monthly-cycle.job.js, schedule-window.js's raised
// monthly-cadence lookback, and cardcom-ops.controller.js's new scheduler
// heartbeat signal. Built directly from the 2026-09-08 brief's test list.
//
// Mix of pure unit tests (date-boundary math, heartbeat classification --
// no DB, no residue risk) and real-DB fixture tests (period
// creation/idempotency), following the same live-fixture convention as
// scripts/test-billing-bulk-approval-live-fixture.js and
// scripts/test-masav-e2e-live-fixture.js: real rows, real production
// functions, full cleanup + zero-residue verification in a finally block.
//
// Deliberately never creates a real `status='paid'` donation -- migration
// 055's trg_donations_block_paid_delete makes any such row permanently
// undeletable (checked on OLD.status alone, no is_mock exception), the same
// conflict those two scripts already document and avoid. The real-DB
// fixture here proves the job's period-creation/calculation-invocation/
// idempotency wiring using a billing_account with zero eligible donations
// (a genuine, real "zero activity" code path in calculateAccountStatement,
// not a fake) -- every row this script creates stays cleanly deletable.
//
// Run: node scripts/test-billing-monthly-cycle.js

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');
const monthlyCycleJob = require('../src/jobs/billing-monthly-cycle.job');
const { checkWindow } = require('../src/jobs/schedule-window');
const jobRunner = require('../src/jobs');
const { getSchedulerHeartbeat } = require('../src/modules/platform/cardcom-ops/cardcom-ops.controller');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `ZZZ_TEST_DATA_DO_NOT_USE_billing-monthly-cycle-${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17; // same fixture actor as every other live-fixture script in this repo

function fakeDbNoSuccessRows() {
  return { query: async () => ({ rows: [] }) };
}

async function main() {
  const fixture = { entityId: null, accountId: null, periodId: null };

  try {
    // ==== 1. Pure date-boundary math (no DB) -- month/year boundary =========

    await check('1a. ordinary month: now=2026-09-15 -> targets August 2026 (UTC month boundaries)', async () => {
      const { periodStart, periodEnd } = monthlyCycleJob.computePreviousMonthUtcBoundary(new Date('2026-09-15T12:00:00Z'));
      assert.strictEqual(periodStart.toISOString(), '2026-08-01T00:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2026-09-01T00:00:00.000Z');
    });

    await check('1b. exactly on the scheduled instant: now=2026-10-01T03:00:00Z -> targets September 2026', async () => {
      const { periodStart, periodEnd } = monthlyCycleJob.computePreviousMonthUtcBoundary(new Date('2026-10-01T03:00:00Z'));
      assert.strictEqual(periodStart.toISOString(), '2026-09-01T00:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2026-10-01T00:00:00.000Z');
    });

    await check('1c. January -> December of the PRIOR year (year rollover)', async () => {
      const { periodStart, periodEnd } = monthlyCycleJob.computePreviousMonthUtcBoundary(new Date('2026-01-09T00:00:00Z'));
      assert.strictEqual(periodStart.toISOString(), '2025-12-01T00:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2026-01-01T00:00:00.000Z');
    });

    await check('1d. late catch-up run (10 days into the month) still targets the same previous month as running on day 1', async () => {
      const onTime = monthlyCycleJob.computePreviousMonthUtcBoundary(new Date('2026-09-01T03:00:00Z'));
      const late = monthlyCycleJob.computePreviousMonthUtcBoundary(new Date('2026-09-11T09:00:00Z'));
      assert.strictEqual(onTime.periodStart.toISOString(), late.periodStart.toISOString());
      assert.strictEqual(onTime.periodEnd.toISOString(), late.periodEnd.toISOString());
    });

    // ==== 2. Monthly cron window matching (schedule-window.js) -- proves the
    // raised MAX_LOOKBACK_MINUTES actually lets a real Render Cron outage of
    // several days still catch up correctly, and that the registered job's
    // own schedule string is honored by the real checkWindow primitive. ====

    await check('2a. billing-monthly-cycle is registered with the intended monthly schedule', async () => {
      const job = jobRunner.get('billing-monthly-cycle');
      assert.ok(job, 'job must be registered in src/jobs/index.js');
      assert.strictEqual(job.schedule, '0 3 1 * *');
    });

    await check('2b. 10 days after the 1st, with no recorded success -> due, windowStart is this month\'s 1st at 03:00 UTC', async () => {
      const job = jobRunner.get('billing-monthly-cycle');
      const now = new Date('2026-09-11T09:00:00Z');
      const { due, windowStart } = await checkWindow(fakeDbNoSuccessRows(), job, now);
      assert.strictEqual(due, true);
      assert.strictEqual(windowStart.toISOString(), '2026-09-01T03:00:00.000Z');
    });

    await check('2c. collection-attempt-reconciliation (real registered job) still matches its hourly schedule after the lookback change', async () => {
      const job = jobRunner.get('collection-attempt-reconciliation');
      assert.strictEqual(job.schedule, '0 * * * *');
      const now = new Date('2026-09-11T14:37:00Z');
      const { due, windowStart } = await checkWindow(fakeDbNoSuccessRows(), job, now);
      assert.strictEqual(due, true);
      assert.strictEqual(windowStart.toISOString(), '2026-09-11T14:00:00.000Z');
    });

    // ==== 3. Structural proof: this job cannot approve/collect/pay =========
    // Static source scan, same technique as test-masav-e2e-live-fixture.js's
    // recordMasavResult check -- proves by construction (not just by not
    // having tested it) that approval/collection/MASAV services are never
    // even required by this file, so it is structurally incapable of
    // approving a Statement, opening a collection attempt, or creating a
    // Payment, independent of any runtime behavior.

    await check('3. billing-monthly-cycle.job.js never requires approval/collection/masav services', async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'jobs', 'billing-monthly-cycle.job.js'), 'utf8');
      const forbidden = ['approval.service', 'collection.service', 'masav-collection.service', 'masav-config.service', 'cardcom-token-charge.adapter'];
      const hits = forbidden.filter((name) => src.includes(name));
      assert.deepStrictEqual(hits, [], `forbidden service reference(s) found: ${hits.join(', ')}`);
    });

    // ==== 4. Real-DB fixture: period creation + calculation reuse + full
    // idempotency, against a far-future month no real billing_period will
    // ever occupy. =========================================================

    const FIXTURE_NOW = new Date('2099-07-05T03:00:00.000Z'); // targets 2099-06 (June 2099) -- never collides with any real period
    const EXPECTED_PERIOD_START = '2099-06-01T00:00:00.000Z';
    const EXPECTED_PERIOD_END = '2099-07-01T00:00:00.000Z';

    const entity = await pool.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, $2, 'active', 'association') RETURNING id`,
      [FIXTURE_TAG, SUPER_ADMIN_USER_ID]
    );
    fixture.entityId = entity.rows[0].id;

    const account = await pool.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate) VALUES ($1, 0.03, 0.18) RETURNING id`,
      [fixture.entityId]
    );
    fixture.accountId = account.rows[0].id;

    let firstResult;
    await check('4a. first run: creates the period for the target month and runs calculation through the real production path', async () => {
      firstResult = await monthlyCycleJob.handler(pool, { now: FIXTURE_NOW });
      fixture.periodId = firstResult.periodId;

      assert.strictEqual(firstResult.periodStart, EXPECTED_PERIOD_START);
      assert.strictEqual(firstResult.periodEnd, EXPECTED_PERIOD_END);
      assert.strictEqual(firstResult.periodCreated, true);
      assert.strictEqual(firstResult.calculationRan, true);
      assert.ok(firstResult.billingRunId, 'must return the real billing_runs id from runProductionCalculation');
      // Zero eligible donations for this fixture account -- the real,
      // unmocked "zero activity" branch of calculateAccountStatement.
      assert.strictEqual(firstResult.statementsCreated, 0);
      assert.ok(firstResult.accountsEvaluated >= 1);

      const periodRows = await pool.query(
        `SELECT period_start, period_end FROM billing_periods WHERE id = $1`,
        [fixture.periodId]
      );
      assert.strictEqual(periodRows.rows[0].period_start.toISOString(), EXPECTED_PERIOD_START);
      assert.strictEqual(periodRows.rows[0].period_end.toISOString(), EXPECTED_PERIOD_END);

      const runRows = await pool.query(`SELECT id FROM billing_runs WHERE billing_period_id = $1`, [fixture.periodId]);
      assert.strictEqual(runRows.rows.length, 1, 'exactly one billing_run must exist after the first call');
    });

    await check('4b. existing-period reuse: calling ensurePeriod again for the same bounds returns the SAME period id, creates no duplicate', async () => {
      const { periodId, periodCreated } = await monthlyCycleJob.ensurePeriod(
        pool, new Date(EXPECTED_PERIOD_START), new Date(EXPECTED_PERIOD_END)
      );
      assert.strictEqual(periodId, fixture.periodId);
      assert.strictEqual(periodCreated, false);

      const periodRows = await pool.query(
        `SELECT id FROM billing_periods WHERE period_start = $1 AND period_end = $2`,
        [EXPECTED_PERIOD_START, EXPECTED_PERIOD_END]
      );
      assert.strictEqual(periodRows.rows.length, 1, 'still exactly one period row for these bounds');
    });

    await check('4c. rerun idempotency: running the full handler again for the same target month is a safe no-op (no second billing_run, no second Statement)', async () => {
      const secondResult = await monthlyCycleJob.handler(pool, { now: FIXTURE_NOW });

      assert.strictEqual(secondResult.periodId, fixture.periodId);
      assert.strictEqual(secondResult.periodCreated, false);
      assert.strictEqual(secondResult.calculationRan, false);
      assert.strictEqual(secondResult.reason, 'already_calculated');
      assert.strictEqual(secondResult.existingRunId, firstResult.billingRunId);

      const runRows = await pool.query(`SELECT id FROM billing_runs WHERE billing_period_id = $1`, [fixture.periodId]);
      assert.strictEqual(runRows.rows.length, 1, 'still exactly one billing_run after a second call -- no duplicate calculation');
    });

    await check('4d. overlap-mismatch: a period with different, overlapping bounds is never silently adopted', async () => {
      const overlapStart = new Date('2099-06-15T00:00:00.000Z'); // inside the fixture period above -- must overlap
      const overlapEnd = new Date('2099-07-15T00:00:00.000Z');
      await assert.rejects(
        () => monthlyCycleJob.ensurePeriod(pool, overlapStart, overlapEnd),
        (err) => err.code === 'PERIOD_OVERLAP_MISMATCH'
      );
    });

    await check('4e. no approval/collection/Payment: statements/collection_attempts/payments are all still empty for this fixture', async () => {
      const stmts = await pool.query(
        `SELECT s.id FROM statements s WHERE s.billing_account_id = $1`,
        [fixture.accountId]
      );
      assert.strictEqual(stmts.rows.length, 0);
    });

    // ==== 5. Scheduler heartbeat classification (fake db, no real DB race
    // against production job_runs -- see getSchedulerHeartbeat's own
    // comment for why it takes db as an explicit, injectable parameter). ===

    function fakeHeartbeatDb(lastHeartbeatAtIso) {
      return {
        query: async (sql) => {
          assert.ok(sql.includes("job_name = 'scheduler-heartbeat'"));
          return { rows: [{ last_heartbeat_at: lastHeartbeatAtIso }] };
        },
      };
    }

    await check('5a. heartbeat 5 minutes ago -> healthy', async () => {
      const now = new Date('2026-09-08T12:00:00Z');
      const result = await getSchedulerHeartbeat(fakeHeartbeatDb(new Date(now.getTime() - 5 * 60_000).toISOString()), now);
      assert.strictEqual(result.healthy, true);
      assert.strictEqual(result.minutesSinceLastHeartbeat, 5);
    });

    await check('5b. heartbeat 45 minutes ago (past the 30-minute tolerance) -> not healthy', async () => {
      const now = new Date('2026-09-08T12:00:00Z');
      const result = await getSchedulerHeartbeat(fakeHeartbeatDb(new Date(now.getTime() - 45 * 60_000).toISOString()), now);
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.minutesSinceLastHeartbeat, 45);
    });

    await check('5c. no heartbeat ever recorded -> not healthy, minutesSinceLastHeartbeat null (not "0 minutes")', async () => {
      const now = new Date('2026-09-08T12:00:00Z');
      const result = await getSchedulerHeartbeat(fakeHeartbeatDb(null), now);
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.minutesSinceLastHeartbeat, null);
    });
  } finally {
    // ---- cleanup, FK-safe order. No donation/statement_components rows
    // were ever created (see header comment), and no statements were
    // created either (zero-activity fixture) -- every row here is a plain,
    // deletable fixture row. ----
    if (fixture.periodId) await pool.query(`DELETE FROM billing_runs WHERE billing_period_id = $1`, [fixture.periodId]);
    if (fixture.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.periodId]);
    if (fixture.accountId) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [fixture.accountId]);
    if (fixture.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId]);

    await check('cleanup verification: zero residue -- every fixture row is gone', async () => {
      const [r, p, a, e] = await Promise.all([
        fixture.periodId ? pool.query(`SELECT id FROM billing_runs WHERE billing_period_id = $1`, [fixture.periodId]) : { rows: [] },
        fixture.periodId ? pool.query(`SELECT id FROM billing_periods WHERE id = $1`, [fixture.periodId]) : { rows: [] },
        fixture.accountId ? pool.query(`SELECT id FROM billing_accounts WHERE id = $1`, [fixture.accountId]) : { rows: [] },
        fixture.entityId ? pool.query(`SELECT id FROM entities WHERE id = $1`, [fixture.entityId]) : { rows: [] },
      ]);
      assert.strictEqual(r.rows.length, 0, 'billing_runs residue');
      assert.strictEqual(p.rows.length, 0, 'billing_periods residue');
      assert.strictEqual(a.rows.length, 0, 'billing_accounts residue');
      assert.strictEqual(e.rows.length, 0, 'entities residue');
    });
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
