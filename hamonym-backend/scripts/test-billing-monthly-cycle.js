// Regression coverage for Billing Monthly Cycle v1 (2026-09-08; restored
// to the frozen 28->28 cutoff model 2026-09-18) --
// src/jobs/billing-monthly-cycle.job.js, schedule-window.js's raised
// lookback, and cardcom-ops.controller.js's scheduler heartbeat signal.
//
// Mix of pure unit tests (date-boundary math via the real Postgres-backed
// Asia/Jerusalem conversion, heartbeat classification) and real-DB
// fixture tests (period creation/idempotency), following the same
// live-fixture convention as scripts/test-billing-bulk-approval-live-
// fixture.js and scripts/test-masav-e2e-live-fixture.js: real rows, real
// production functions, full cleanup + zero-residue verification in a
// finally block.
//
// Deliberately never creates a real `status='paid'` donation -- migration
// 055's trg_donations_block_paid_delete makes any such row permanently
// undeletable. The real-DB fixture here proves the job's period-creation/
// calculation-invocation/idempotency wiring using a billing_account with
// zero eligible donations (a genuine, real "zero activity" code path in
// calculateAccountStatement, not a fake) -- every row this script creates
// stays cleanly deletable.
//
// Fixture window: year 2095, distinct from every other reserved far-future
// window in this repo (2097-05, 2098-08, 2099-06/07 transient, 2099-08
// permanent E2E) -- picked far enough from all of them that a 28->28
// cycle's wider range (spanning parts of two calendar months) cannot
// overlap any of them either.
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
const { computeIsraeliCutoffUtcInstant } = require('../src/modules/billing-engine/billing-period.util');

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
    // ==== 1. Real cutoff-boundary math (Postgres-backed Asia/Jerusalem
    // conversion -- never a hardcoded UTC offset) ==========================

    await check('1a. DST month (August): cutoff is 20:00 Israel = 17:00 UTC (IDT, UTC+3)', async () => {
      const cutoff = await computeIsraeliCutoffUtcInstant(pool, 2026, 8);
      assert.strictEqual(cutoff.toISOString(), '2026-08-28T17:00:00.000Z');
    });

    await check('1b. standard-time month (January): cutoff is 20:00 Israel = 18:00 UTC (IST, UTC+2)', async () => {
      const cutoff = await computeIsraeliCutoffUtcInstant(pool, 2026, 1);
      assert.strictEqual(cutoff.toISOString(), '2026-01-28T18:00:00.000Z');
    });

    await check('1c. February (28-day month) has a real 28th like any other month', async () => {
      const cutoff = await computeIsraeliCutoffUtcInstant(pool, 2026, 2);
      assert.strictEqual(cutoff.toISOString(), '2026-02-28T18:00:00.000Z');
    });

    await check('1d. 30-day month (April) and 31-day month (May) both resolve on their own 28th, not a rolled-over date', async () => {
      const apr = await computeIsraeliCutoffUtcInstant(pool, 2026, 4);
      const may = await computeIsraeliCutoffUtcInstant(pool, 2026, 5);
      assert.strictEqual(apr.toISOString(), '2026-04-28T17:00:00.000Z');
      assert.strictEqual(may.toISOString(), '2026-05-28T17:00:00.000Z');
    });

    // Post-transition months only (December 2026 onward) -- pure 28->28
    // semantics with no transition-override involvement (see section 1k
    // below for the transition month itself, and 1l for proof that a
    // check landing on the OLD-model side, e.g. September 2026, correctly
    // keeps resolving to real history instead of a synthetic cycle).
    await check('1e. computeMostRecentCycleBoundary: ordinary case, now well past this month\'s cutoff -> targets THIS month\'s cycle', async () => {
      const { periodStart, periodEnd } = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2026-12-29T00:00:00Z'));
      assert.strictEqual(periodStart.toISOString(), '2026-11-28T18:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2026-12-28T18:00:00.000Z');
    });

    await check('1f. "not yet due" guard: now is EARLIER the same day, before the real cutoff instant -> falls back to the PREVIOUS cycle, never closes the current one early', async () => {
      const { periodStart, periodEnd } = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2026-12-28T10:00:00Z')); // 10:00 UTC, cutoff is 18:00 UTC that day (standard time)
      assert.strictEqual(periodStart.toISOString(), '2026-10-28T18:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2026-11-28T18:00:00.000Z');
    });

    await check('1g. one millisecond before the cutoff still falls back to the previous cycle; one millisecond after already targets the new one', async () => {
      const before = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2026-12-28T17:59:59.999Z'));
      const after = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2026-12-28T18:00:00.001Z'));
      assert.strictEqual(before.periodEnd.toISOString(), '2026-11-28T18:00:00.000Z');
      assert.strictEqual(after.periodEnd.toISOString(), '2026-12-28T18:00:00.000Z');
    });

    await check('1h. exactly AT the cutoff instant belongs to the NEW cycle (half-open [start,end))', async () => {
      const exact = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2026-12-28T18:00:00.000Z'));
      assert.strictEqual(exact.periodEnd.toISOString(), '2026-12-28T18:00:00.000Z');
    });

    await check('1i. year rollover: a check in early January correctly falls back to December\'s cycle of the PRIOR year', async () => {
      const { periodStart, periodEnd } = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2027-01-05T00:00:00Z'));
      assert.strictEqual(periodStart.toISOString(), '2026-11-28T18:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2026-12-28T18:00:00.000Z');
    });

    await check('1j. late catch-up run (several days into the month) still targets the same cycle as an on-time check', async () => {
      const onTime = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2026-12-28T19:00:00Z'));
      const late = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2027-01-05T09:00:00Z'));
      assert.strictEqual(onTime.periodEnd.toISOString(), late.periodEnd.toISOString());
    });

    await check('1k. the October 2026 transition month resolves through computeMostRecentCycleBoundary too, with no special-casing needed at this call site', async () => {
      const { periodStart, periodEnd } = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2026-11-01T00:00:00Z'));
      assert.strictEqual(periodStart.toISOString(), '2026-10-01T00:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2026-10-28T18:00:00.000Z');
    });

    await check('1l. a check on 15 Oct 2026 (before October\'s own transition cutoff) falls back one cycle -- landing on real September 2026, the real, existing calendar-month period, never a synthetic 28->28 cycle for a month that predates the restoration', async () => {
      const { periodStart, periodEnd } = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date('2026-10-15T00:00:00Z'));
      assert.strictEqual(periodStart.toISOString(), '2026-09-01T00:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2026-10-01T00:00:00.000Z');
    });

    // ==== 2. Cron window matching (schedule-window.js) -- proves the new
    // hourly-on-day-28 schedule is honored, and that an early-in-the-day
    // check is legitimately "due" without ever being treated as stale. ====

    await check('2a. billing-monthly-cycle is registered with the new hourly-on-day-28 UTC schedule', async () => {
      const job = jobRunner.get('billing-monthly-cycle');
      assert.ok(job, 'job must be registered in src/jobs/index.js');
      assert.strictEqual(job.schedule, '0 * 28 * *');
    });

    await check('2b. a check at 10:00 UTC on the 28th (before the real Israel-time cutoff), with no recorded success -> due, windowStart is 10:00 that day', async () => {
      const job = jobRunner.get('billing-monthly-cycle');
      const now = new Date('2026-09-28T10:00:00Z');
      const { due, windowStart } = await checkWindow(fakeDbNoSuccessRows(), job, now);
      assert.strictEqual(due, true);
      assert.strictEqual(windowStart.toISOString(), '2026-09-28T10:00:00.000Z');
    });

    await check('2c. collection-attempt-reconciliation (real registered job) still matches its own unrelated hourly schedule', async () => {
      const job = jobRunner.get('collection-attempt-reconciliation');
      assert.strictEqual(job.schedule, '0 * * * *');
      const now = new Date('2026-09-11T14:37:00Z');
      const { due, windowStart } = await checkWindow(fakeDbNoSuccessRows(), job, now);
      assert.strictEqual(due, true);
      assert.strictEqual(windowStart.toISOString(), '2026-09-11T14:00:00.000Z');
    });

    // ==== 3. Structural proof: this job cannot approve/collect/pay =========

    await check('3. billing-monthly-cycle.job.js never requires approval/collection/masav services', async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'jobs', 'billing-monthly-cycle.job.js'), 'utf8');
      const forbidden = ['approval.service', 'collection.service', 'masav-collection.service', 'masav-config.service', 'cardcom-token-charge.adapter'];
      const hits = forbidden.filter((name) => src.includes(name));
      assert.deepStrictEqual(hits, [], `forbidden service reference(s) found: ${hits.join(', ')}`);
    });

    // ==== 4. Real-DB fixture: period creation + calculation reuse + full
    // idempotency, against a far-future 28->28 cycle no real billing_period
    // will ever occupy. =====================================================

    const FIXTURE_NOW = new Date('2095-10-05T03:00:00.000Z'); // well past 2095-09's cutoff -> targets the Sep 2095 cycle
    const EXPECTED_PERIOD_START = '2095-08-28T17:00:00.000Z';
    const EXPECTED_PERIOD_END = '2095-09-28T17:00:00.000Z';

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
    await check('4a. first run: creates the period for the target cycle and runs calculation through the real production path', async () => {
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

    await check('4c. rerun idempotency: running the full handler again for the same cycle is a safe no-op (no second billing_run, no second Statement)', async () => {
      const secondResult = await monthlyCycleJob.handler(pool, { now: FIXTURE_NOW });

      assert.strictEqual(secondResult.periodId, fixture.periodId);
      assert.strictEqual(secondResult.periodCreated, false);
      assert.strictEqual(secondResult.calculationRan, false);
      assert.strictEqual(secondResult.reason, 'already_calculated');
      assert.strictEqual(secondResult.existingRunId, firstResult.billingRunId);

      const runRows = await pool.query(`SELECT id FROM billing_runs WHERE billing_period_id = $1`, [fixture.periodId]);
      assert.strictEqual(runRows.rows.length, 1, 'still exactly one billing_run after a second call -- no duplicate calculation');
    });

    await check('4d. a check EARLIER the same real cutoff day (before the real cutoff instant) is a harmless no-op, not a premature close of the still-open cycle', async () => {
      const earlyResult = await monthlyCycleJob.handler(pool, { now: new Date('2095-09-28T10:00:00.000Z') }); // 10:00 UTC, cutoff is 17:00 UTC that day
      // Falls back to the PREVIOUS cycle (Aug 2095), which has no fixture data at all -- creates/finds that period, never touches the Sep fixture.
      assert.notStrictEqual(earlyResult.periodId, fixture.periodId);
      assert.strictEqual(earlyResult.periodEnd, EXPECTED_PERIOD_START, 'the fallback cycle must end exactly where the fixture cycle starts');

      // Clean up this incidental extra period immediately -- it's not part
      // of the main fixture and would otherwise leak.
      await pool.query(`DELETE FROM billing_runs WHERE billing_period_id = $1`, [earlyResult.periodId]);
      await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [earlyResult.periodId]);
    });

    await check('4e. overlap-mismatch: a period with different, overlapping bounds is never silently adopted', async () => {
      const overlapStart = new Date('2095-09-01T00:00:00.000Z'); // inside the fixture cycle above -- must overlap
      const overlapEnd = new Date('2095-10-01T00:00:00.000Z');
      await assert.rejects(
        () => monthlyCycleJob.ensurePeriod(pool, overlapStart, overlapEnd),
        (err) => err.code === 'PERIOD_OVERLAP_MISMATCH'
      );
    });

    await check('4f. no approval/collection/Payment: statements/collection_attempts/payments are all still empty for this fixture', async () => {
      const stmts = await pool.query(
        `SELECT s.id FROM statements s WHERE s.billing_account_id = $1`,
        [fixture.accountId]
      );
      assert.strictEqual(stmts.rows.length, 0);
    });

    // ==== 5. Scheduler heartbeat classification (fake db, no real DB race
    // against production job_runs). ==========================================

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
