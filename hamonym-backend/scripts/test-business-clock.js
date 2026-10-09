// Business clock, Phase A (2026-10-09) -- src/lib/clock.js, the job-runner
// business-time seam, and every business-time call site converted in this
// pass.
//
// What this proves, in order:
//   1. Simulation OFF is a true no-op: real wall-clock, ZERO db queries.
//   2. Only the exact string 'on' enables simulation.
//   3. Simulation ON reads the single simulation_clock row (fake db for the
//      pure read logic, plus a real Postgres round-trip so timestamptz
//      parsing is proven against the actual driver, not assumed).
//   4. realNow() ignores simulation entirely.
//   5. job-runner.js stays backward compatible (1-arg handlers untouched),
//      hands business time to 2-arg handlers, and keeps job_runs timestamps
//      on real wall-clock under simulation.
//   6. A REAL job's business decision (email-dispatch-recovery's
//      retry-eligibility window) flips false -> true purely by advancing
//      simulated business time, with real wall-clock never moving.
//   7. recurring.service.js's scheduling date math observes injected
//      business time, including the anchor-day clamping edge case.
//   8. billing-monthly-cycle's cutoff-boundary decision observes injected
//      business time, and is identical to today's behavior when simulation
//      is off.
//
// simulation_clock is created and dropped BY THIS SCRIPT (see
// withSimulationClockTable below). It is deliberately NOT a numbered
// migration: it is simulation-only infrastructure for a later phase and
// must never exist in a production database.
//
// Nothing here creates a donation, a payment, a receipt, or anything with
// status 'paid'. The one real-DB fixture is a single email_logs row with an
// intentionally unknown template, so even the recovery job's own dispatch
// path cannot reach a provider. The separate, stricter safety proof lives in
// scripts/test-business-clock-safety.js.
//
// Run: node scripts/test-business-clock.js

require('dotenv').config();

// Simulation must start OFF regardless of what .env or the shell happens to
// hold, so section 1's "identical to production" claim is real.
delete process.env.HAMONYM_SIMULATION_MODE;

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');
const clock = require('../src/lib/clock');
const jobRunner = require('../src/jobs/job-runner');
const monthlyCycleJob = require('../src/jobs/billing-monthly-cycle.job');
const emailDispatchRecoveryJob = require('../src/jobs/email-dispatch-recovery.job');
const recurring = require('../src/modules/donations/recurring.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `ZZZ_TEST_DATA_DO_NOT_USE_business-clock-${Date.now()}`;
const TEST_JOB_ONE_ARG = `ZZZ_TEST_clock-one-arg-${Date.now()}`;
const TEST_JOB_TWO_ARG = `ZZZ_TEST_clock-two-arg-${Date.now()}`;

function simOn() { process.env.HAMONYM_SIMULATION_MODE = 'on'; }
function simOff() { delete process.env.HAMONYM_SIMULATION_MODE; }

// A db that makes any query a loud failure rather than a silent cost --
// section 1's zero-query claim is enforced, not inspected.
const explodingDb = {
  query: () => { throw new Error('clock.now() queried the database while simulation was OFF'); },
};

function countingDb() {
  const state = { count: 0 };
  return {
    state,
    db: { query: (...args) => { state.count++; return pool.query(...args); } },
  };
}

function fakeClockDb(row) {
  const state = { sql: [] };
  return {
    state,
    db: { query: async (sql) => { state.sql.push(sql); return { rows: row ? [row] : [] }; } },
  };
}

async function createSimulationClockTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS simulation_clock (
      id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      offset_ms  bigint NOT NULL DEFAULT 0,
      fixed_at   timestamptz,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )`);
}

async function dropSimulationClockTable() {
  await pool.query(`DROP TABLE IF EXISTS simulation_clock`);
}

// Freeze simulated business time at an exact instant.
async function setFixedBusinessTime(iso) {
  await pool.query(
    `INSERT INTO simulation_clock (id, offset_ms, fixed_at, updated_at)
     VALUES (1, 0, $1::timestamptz, NOW())
     ON CONFLICT (id) DO UPDATE SET offset_ms = 0, fixed_at = EXCLUDED.fixed_at, updated_at = NOW()`,
    [iso]
  );
}

// Shift simulated business time relative to real wall-clock (business time
// still flows, just offset).
async function setBusinessTimeOffset(offsetMs) {
  await pool.query(
    `INSERT INTO simulation_clock (id, offset_ms, fixed_at, updated_at)
     VALUES (1, $1, NULL, NOW())
     ON CONFLICT (id) DO UPDATE SET offset_ms = EXCLUDED.offset_ms, fixed_at = NULL, updated_at = NOW()`,
    [offsetMs]
  );
}

async function main() {
  const fixture = { emailLogId: null, simulationTableCreated: false };

  try {
    // ==== 1. Simulation OFF: real wall-clock, and provably zero queries ====

    await check('1a. simulation OFF: clock.now() returns real wall-clock (within tolerance)', async () => {
      simOff();
      const before = Date.now();
      const n = await clock.now(pool);
      const after = Date.now();
      assert.ok(n instanceof Date, 'must return a Date');
      assert.ok(n.getTime() >= before - 5 && n.getTime() <= after + 5,
        `clock.now()=${n.toISOString()} outside [${new Date(before).toISOString()}, ${new Date(after).toISOString()}]`);
    });

    await check('1b. simulation OFF: clock.now() issues ZERO db queries -- a db that throws on any query is still never touched', async () => {
      simOff();
      const n = await clock.now(explodingDb); // would throw if any query were attempted
      assert.ok(n instanceof Date);
    });

    await check('1c. simulation OFF: counted query calls against the REAL pool wrapper is exactly 0 (now + today, 20 calls)', async () => {
      simOff();
      const { state, db } = countingDb();
      for (let i = 0; i < 10; i++) {
        await clock.now(db);
        await clock.today(db);
      }
      assert.strictEqual(state.count, 0, `expected 0 queries, got ${state.count}`);
    });

    await check('1d. simulation OFF: clock.today() matches local calendar date of real now', async () => {
      simOff();
      const d = new Date();
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      assert.strictEqual(await clock.today(explodingDb), expected);
    });

    // ==== 2. Exact-flag matching ============================================

    const OFF_VALUES = ['false', 'true', '1', '0', 'test', 'ON', 'On', 'yes', 'on ', ' on', '', 'enabled'];
    for (const value of OFF_VALUES) {
      await check(`2. HAMONYM_SIMULATION_MODE=${JSON.stringify(value)} behaves as OFF (no query, real time)`, async () => {
        process.env.HAMONYM_SIMULATION_MODE = value;
        assert.strictEqual(clock.isSimulationEnabled(), false, 'isSimulationEnabled() must be false');
        const n = await clock.now(explodingDb); // throws if the simulated path is taken
        assert.ok(Math.abs(n.getTime() - Date.now()) < 1000);
      });
    }

    await check('2z. only the exact string \'on\' enables simulation', async () => {
      simOn();
      assert.strictEqual(clock.isSimulationEnabled(), true);
      simOff();
      assert.strictEqual(clock.isSimulationEnabled(), false, 'an absent variable must mean OFF');
    });

    // ==== 3. Simulation ON: reads simulation_clock ==========================

    await check('3a. simulation ON, fake db: reads from simulation_clock and honours fixed_at exactly', async () => {
      simOn();
      const { state, db } = fakeClockDb({ offset_ms: '0', fixed_at: '2031-03-07T09:15:00.000Z' });
      const n = await clock.now(db);
      assert.strictEqual(state.sql.length, 1, 'exactly one query');
      assert.ok(/simulation_clock/.test(state.sql[0]), 'must read the simulation_clock table');
      assert.strictEqual(n.toISOString(), '2031-03-07T09:15:00.000Z');
    });

    await check('3b. simulation ON, fake db: fixed_at is frozen -- two calls apart return the identical instant', async () => {
      simOn();
      const { db } = fakeClockDb({ offset_ms: '0', fixed_at: '2031-03-07T09:15:00.000Z' });
      const a = await clock.now(db);
      await new Promise((r) => setTimeout(r, 30));
      const b = await clock.now(db);
      assert.strictEqual(a.getTime(), b.getTime(), 'a frozen clock must not drift');
    });

    await check('3c. simulation ON, fake db: offset_ms shifts business time relative to real now', async () => {
      simOn();
      const offset = 90 * 24 * 60 * 60 * 1000; // +90 days
      const { db } = fakeClockDb({ offset_ms: String(offset), fixed_at: null });
      const realBefore = Date.now();
      const n = await clock.now(db);
      assert.ok(Math.abs(n.getTime() - (realBefore + offset)) < 2000,
        `expected ~+90d from real now, got ${n.toISOString()}`);
    });

    await check('3d. simulation ON but no row present: falls back to real wall-clock instead of throwing', async () => {
      simOn();
      const { db } = fakeClockDb(null);
      const n = await clock.now(db);
      assert.ok(Math.abs(n.getTime() - Date.now()) < 1000);
    });

    await check('3e. simulation ON but simulation_clock table does not exist (42P01): falls back to real wall-clock', async () => {
      simOn();
      const missingTableDb = {
        query: async () => { const e = new Error('relation "simulation_clock" does not exist'); e.code = '42P01'; throw e; },
      };
      const n = await clock.now(missingTableDb);
      assert.ok(Math.abs(n.getTime() - Date.now()) < 1000);
    });

    await check('3f. simulation ON and the db fails for a REAL reason: the error propagates, never disguised as a missing clock', async () => {
      simOn();
      const brokenDb = {
        query: async () => { const e = new Error('connection terminated'); e.code = 'ECONNRESET'; throw e; },
      };
      await assert.rejects(() => clock.now(brokenDb), /connection terminated/);
    });

    // Real Postgres round-trip -- proves the driver's timestamptz parsing,
    // not an assumption about it.
    await createSimulationClockTable();
    fixture.simulationTableCreated = true;

    const FIXED_ISO = '2031-03-07T09:15:00.000Z';

    await check('3g. simulation ON against a REAL simulation_clock row: clock.now() returns the stored instant', async () => {
      simOn();
      await setFixedBusinessTime(FIXED_ISO);
      const n = await clock.now(pool);
      assert.strictEqual(n.toISOString(), FIXED_ISO);
    });

    await check('3h. simulation ON against a REAL row: clock.today() derives the correct YYYY-MM-DD (local calendar, same convention as dayOfMonthFromDate)', async () => {
      simOn();
      await setFixedBusinessTime(FIXED_ISO);
      const d = new Date(FIXED_ISO);
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      assert.strictEqual(await clock.today(pool), expected);
    });

    await check('3i. simulation ON against a REAL row: switching to offset_ms mode shifts business time, real time untouched', async () => {
      simOn();
      const offset = 365 * 24 * 60 * 60 * 1000;
      await setBusinessTimeOffset(offset);
      const realBefore = Date.now();
      const n = await clock.now(pool);
      assert.ok(Math.abs(n.getTime() - (realBefore + offset)) < 5000);
      assert.ok(Math.abs(clock.realNow().getTime() - Date.now()) < 1000, 'real clock must be unaffected');
    });

    // ==== 4. realNow() ignores simulation entirely ==========================

    await check('4a. realNow() is real wall-clock with simulation OFF', async () => {
      simOff();
      assert.ok(Math.abs(clock.realNow().getTime() - Date.now()) < 50);
    });

    await check('4b. realNow() is STILL real wall-clock with simulation ON and business time 1 year ahead', async () => {
      simOn();
      await setFixedBusinessTime('2031-03-07T09:15:00.000Z');
      const business = await clock.now(pool);
      const real = clock.realNow();
      assert.strictEqual(business.toISOString(), '2031-03-07T09:15:00.000Z');
      assert.ok(Math.abs(real.getTime() - Date.now()) < 50, 'realNow() must not observe simulation');
      assert.ok(Math.abs(business.getTime() - real.getTime()) > 24 * 60 * 60 * 1000, 'the two clocks must genuinely differ');
    });

    await check('4c. realNow() takes no db argument and cannot query -- it is a pure wall-clock read', async () => {
      assert.strictEqual(clock.realNow.length, 0, 'realNow() must take no parameters');
    });

    // ==== 5. job-runner backward compatibility + business-time delivery =====

    let oneArgRan = 0;
    let oneArgDbWasUsable = false;
    jobRunner.register({
      name: TEST_JOB_ONE_ARG,
      timeoutMs: 30000,
      // Deliberately declares ONE parameter only -- exactly the shape every
      // pre-existing handler had, completely unmodified. The runner now
      // passes a second argument, which this handler simply ignores.
      handler: async (db) => {
        oneArgRan++;
        oneArgDbWasUsable = !!db && typeof db.query === 'function';
        const r = await db.query('SELECT 1 AS ok');
        return { ok: r.rows[0].ok };
      },
    });

    let twoArgSeenNow = null;
    jobRunner.register({
      name: TEST_JOB_TWO_ARG,
      timeoutMs: 30000,
      handler: async (db, { now } = {}) => {
        twoArgSeenNow = now;
        return { sawNow: now ? now.toISOString() : null };
      },
    });

    await check('5a. an existing ONE-argument handler still works unmodified through the updated runner, with db still first', async () => {
      simOff();
      const res = await jobRunner.run(TEST_JOB_ONE_ARG, { triggeredBy: 'test' });
      assert.strictEqual(res.status, 'success', `job failed: ${res.error}`);
      assert.strictEqual(oneArgRan, 1);
      assert.ok(oneArgDbWasUsable, 'db must still be the FIRST argument and usable');
      assert.deepStrictEqual(res.result, { ok: 1 });
    });

    await check('5b. a TWO-argument handler receives business time as the second argument', async () => {
      simOff();
      twoArgSeenNow = null;
      const res = await jobRunner.run(TEST_JOB_TWO_ARG, { triggeredBy: 'test' });
      assert.strictEqual(res.status, 'success', `job failed: ${res.error}`);
      assert.ok(twoArgSeenNow instanceof Date, 'second argument must carry a Date `now`');
      assert.ok(Math.abs(twoArgSeenNow.getTime() - Date.now()) < 60000, 'with simulation off it must be real time');
    });

    await check('5c. simulation ON: the handler receives SIMULATED business time from the runner', async () => {
      simOn();
      await setFixedBusinessTime('2031-03-07T09:15:00.000Z');
      twoArgSeenNow = null;
      const res = await jobRunner.run(TEST_JOB_TWO_ARG, { triggeredBy: 'test' });
      assert.strictEqual(res.status, 'success', `job failed: ${res.error}`);
      assert.strictEqual(twoArgSeenNow.toISOString(), '2031-03-07T09:15:00.000Z');
    });

    await check('5d. job_runs.started_at/finished_at/duration_ms stay REAL wall-clock even with business time a year ahead', async () => {
      simOn();
      await setFixedBusinessTime('2031-03-07T09:15:00.000Z');
      const realBefore = Date.now();
      const res = await jobRunner.run(TEST_JOB_TWO_ARG, { triggeredBy: 'test' });
      const realAfter = Date.now();
      assert.strictEqual(res.status, 'success');

      const row = await pool.query(
        `SELECT started_at, finished_at, duration_ms FROM job_runs WHERE id = $1`, [res.runId]
      );
      const { started_at, finished_at, duration_ms } = row.rows[0];
      const startMs = new Date(started_at).getTime();
      const finishMs = new Date(finished_at).getTime();

      // Generous tolerance: these come from the DB server's own clock, which
      // is a remote host and need not agree with this machine to the second.
      const TOL = 5 * 60 * 1000;
      assert.ok(startMs >= realBefore - TOL && startMs <= realAfter + TOL,
        `started_at ${started_at} is not real wall-clock (business time was 2031)`);
      assert.ok(finishMs >= realBefore - TOL && finishMs <= realAfter + TOL,
        `finished_at ${finished_at} is not real wall-clock (business time was 2031)`);
      // duration_ms is `Date.now() - started_at`, mixing THIS machine's
      // clock with the remote database server's clock. Those two differ by
      // of the order of a second against this project's Supabase instance
      // (measured: db ~1.1s ahead), so a sub-second job can legitimately
      // report a small negative duration. That is pre-existing behavior,
      // unchanged by the business clock (job-runner.js's duration_ms line is
      // untouched in this pass) and explicitly NOT what this test is about.
      // What matters here is magnitude: a real elapsed duration is seconds,
      // never the ~5 years a leaked simulated clock would produce.
      assert.ok(Math.abs(duration_ms) < 5 * 60 * 1000,
        `duration_ms ${duration_ms} is not a real elapsed duration -- simulated time may have leaked in`);
      // The decisive check: an audit timestamp must be nowhere near 2031.
      assert.ok(Math.abs(startMs - new Date('2031-03-07T09:15:00.000Z').getTime()) > 300 * 24 * 60 * 60 * 1000,
        'started_at leaked simulated business time');
    });

    // ==== 6. A REAL job's business decision flips purely on business time ===
    //
    // email-dispatch-recovery's retry-eligibility window: a stranded
    // 'pending' email_logs row becomes eligible once it is older than 5
    // minutes (and stays eligible for 1 day). The fixture row's template is
    // intentionally unknown, so even when it IS picked up, redispatchPending
    // returns 'unknown_template' before any provider is contacted.

    const FIXTURE_CREATED_AT = new Date('2031-06-10T12:00:00.000Z');

    const emailLog = await pool.query(
      `INSERT INTO email_logs (to_email, template, subject, status, provider, created_at, payload)
       VALUES ($1, $2, $3, 'pending', 'stub', $4, $5::jsonb) RETURNING id`,
      [
        `${FIXTURE_TAG}@example.invalid`,
        FIXTURE_TAG, // not a real template name -> no provider path reachable
        FIXTURE_TAG,
        FIXTURE_CREATED_AT,
        JSON.stringify({ template: FIXTURE_TAG, to: `${FIXTURE_TAG}@example.invalid`, data: {} }),
      ]
    );
    fixture.emailLogId = emailLog.rows[0].id;

    await check('6a. baseline business time (1 minute after the row was created): NOT yet eligible -- the real job examines nothing', async () => {
      simOn();
      await setFixedBusinessTime(new Date(FIXTURE_CREATED_AT.getTime() + 60 * 1000).toISOString());
      const now = await clock.now(pool);
      const result = await emailDispatchRecoveryJob.handler(pool, { now });
      assert.strictEqual(result.examined, 0, 'a 1-minute-old row must not be treated as stranded');
    });

    await check('6b. advance simulated business time to +30 minutes: the SAME row is now eligible -- decision flipped false -> true with no code or data change', async () => {
      simOn();
      await setFixedBusinessTime(new Date(FIXTURE_CREATED_AT.getTime() + 30 * 60 * 1000).toISOString());
      const now = await clock.now(pool);
      const result = await emailDispatchRecoveryJob.handler(pool, { now });
      assert.strictEqual(result.examined, 1, 'a 30-minute-old stranded row must now be examined');
      // Proof no provider was reachable: the unknown template short-circuits
      // before any send attempt.
      assert.strictEqual(result.failed, 1, 'must have been classified via the unknown-template path, not a send');
      assert.strictEqual(result.sent, 0, 'nothing may ever be sent');
      assert.strictEqual(result.stub, 0);
    });

    await check('6c. real wall-clock never moved across 6a/6b -- only business time did', async () => {
      assert.ok(Math.abs(clock.realNow().getTime() - Date.now()) < 1000);
      const dbReal = await pool.query(`SELECT NOW() AS n`);
      const skew = Math.abs(new Date(dbReal.rows[0].n).getTime() - Date.now());
      assert.ok(skew < 5 * 60 * 1000, `database NOW() drifted into simulated time (skew ${skew}ms)`);
    });

    await check('6d. far-past business time: the same row falls OUT of the 1-day upper bound again (the window is a real two-sided business decision)', async () => {
      simOn();
      // Reset the row to 'pending' so the window, not the status, is what decides.
      await pool.query(`UPDATE email_logs SET status='pending', error=NULL WHERE id=$1`, [fixture.emailLogId]);
      await setFixedBusinessTime(new Date(FIXTURE_CREATED_AT.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString());
      const now = await clock.now(pool);
      const result = await emailDispatchRecoveryJob.handler(pool, { now });
      assert.strictEqual(result.examined, 0, 'a 5-day-old intent must no longer be retried');
    });

    // ==== 7. recurring.service.js scheduling math observes business time ====

    await check('7a. nextMonthDate() observes injected business time', async () => {
      const d = recurring.nextMonthDate(new Date(2030, 0, 15, 10, 0, 0));
      assert.strictEqual(d.getFullYear(), 2030);
      assert.strictEqual(d.getMonth(), 1, 'January -> February');
      assert.strictEqual(d.getDate(), 15);
    });

    await check('7b. nextMonthDate() default argument reproduces the previous new Date() behavior exactly', async () => {
      const before = recurring.nextMonthDate();
      const explicit = recurring.nextMonthDate(new Date());
      assert.ok(Math.abs(before.getTime() - explicit.getTime()) < 1000);
    });

    await check('7c. nextOccurrenceOfAnchorDay(): anchor still ahead this month -> this month\'s occurrence', async () => {
      const d = recurring.nextOccurrenceOfAnchorDay(20, new Date(2030, 4, 5, 9, 0, 0)); // 5 May 2030
      assert.strictEqual(d.getMonth(), 4);
      assert.strictEqual(d.getDate(), 20);
    });

    await check('7d. nextOccurrenceOfAnchorDay(): anchor already passed -> rolls to next month', async () => {
      const d = recurring.nextOccurrenceOfAnchorDay(3, new Date(2030, 4, 20, 9, 0, 0)); // 20 May 2030
      assert.strictEqual(d.getMonth(), 5, 'May -> June');
      assert.strictEqual(d.getDate(), 3);
    });

    await check('7e. CALENDAR EDGE CASE: anchor day 31 on 31 Jan clamps to 28 Feb (non-leap), never rolls into March', async () => {
      const d = recurring.nextOccurrenceOfAnchorDay(31, new Date(2030, 0, 31, 12, 0, 0)); // 2030 is not a leap year
      assert.strictEqual(d.getMonth(), 1, 'must land in February, not March');
      assert.strictEqual(d.getDate(), 28, 'must clamp to the last real day of February');
    });

    await check('7f. CALENDAR EDGE CASE: anchor day 31 on 31 Jan of a LEAP year clamps to 29 Feb', async () => {
      const d = recurring.nextOccurrenceOfAnchorDay(31, new Date(2032, 0, 31, 12, 0, 0)); // 2032 is a leap year
      assert.strictEqual(d.getMonth(), 1);
      assert.strictEqual(d.getDate(), 29);
    });

    await check('7g. CALENDAR EDGE CASE: year rollover -- anchor already passed in December rolls to January of the next year', async () => {
      const d = recurring.nextOccurrenceOfAnchorDay(5, new Date(2030, 11, 20, 9, 0, 0));
      assert.strictEqual(d.getFullYear(), 2031);
      assert.strictEqual(d.getMonth(), 0);
      assert.strictEqual(d.getDate(), 5);
    });

    await check('7h. the SAME anchor day yields DIFFERENT next-charge dates under two different business instants (the date math genuinely follows business time)', async () => {
      const a = recurring.nextOccurrenceOfAnchorDay(15, new Date(2030, 2, 1, 9, 0, 0)); // 1 Mar -> 15 Mar
      const b = recurring.nextOccurrenceOfAnchorDay(15, new Date(2030, 2, 20, 9, 0, 0)); // 20 Mar -> 15 Apr
      assert.strictEqual(a.getMonth(), 2);
      assert.strictEqual(b.getMonth(), 3);
      assert.notStrictEqual(a.getTime(), b.getTime());
    });

    await check('7i. end-to-end through the real clock: a simulated business instant drives the scheduling date', async () => {
      simOn();
      await setFixedBusinessTime('2031-06-20T09:00:00.000Z');
      const businessNow = await clock.now(pool);
      const scheduled = recurring.nextOccurrenceOfAnchorDay(5, businessNow);
      // 20 Jun 2031 (local) -> anchor 5 already passed -> 5 Jul 2031
      assert.strictEqual(scheduled.getFullYear(), 2031);
      assert.strictEqual(scheduled.getMonth(), 6, 'July');
      assert.strictEqual(scheduled.getDate(), 5);
      // And the real clock disagrees, proving the value came from simulation.
      const realScheduled = recurring.nextOccurrenceOfAnchorDay(5, clock.realNow());
      assert.notStrictEqual(scheduled.getTime(), realScheduled.getTime());
    });

    // ==== 8. billing-monthly-cycle cutoff decision observes business time ===

    await check('8a. simulation OFF: the clock-sourced `now` produces the IDENTICAL cycle as a plain new Date() -- production semantics unchanged', async () => {
      simOff();
      const viaClock = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, await clock.now(pool));
      const viaRealDate = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, new Date());
      assert.strictEqual(viaClock.periodStart.toISOString(), viaRealDate.periodStart.toISOString());
      assert.strictEqual(viaClock.periodEnd.toISOString(), viaRealDate.periodEnd.toISOString());
    });

    await check('8b. simulation ON: the cutoff decision targets the cycle implied by SIMULATED business time, not real time', async () => {
      simOn();
      await setFixedBusinessTime('2031-12-29T00:00:00.000Z'); // comfortably past Dec 2031's cutoff
      const businessNow = await clock.now(pool);
      const { periodStart, periodEnd } = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, businessNow);
      assert.strictEqual(periodStart.toISOString(), '2031-11-28T18:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2031-12-28T18:00:00.000Z');
    });

    await check('8c. simulation ON: the "not yet due" guard still holds against business time -- earlier the same cutoff day falls back one cycle', async () => {
      simOn();
      await setFixedBusinessTime('2031-12-28T10:00:00.000Z'); // cutoff that day is 18:00 UTC (standard time)
      const businessNow = await clock.now(pool);
      const { periodStart, periodEnd } = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, businessNow);
      assert.strictEqual(periodStart.toISOString(), '2031-10-28T18:00:00.000Z');
      assert.strictEqual(periodEnd.toISOString(), '2031-11-28T18:00:00.000Z');
    });

    await check('8d. advancing business time across the cutoff instant flips the decision -- the cycle boundary is genuinely business-time driven', async () => {
      simOn();
      await setFixedBusinessTime('2031-12-28T17:59:59.999Z');
      const before = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, await clock.now(pool));
      await setFixedBusinessTime('2031-12-28T18:00:00.001Z');
      const after = await monthlyCycleJob.computeMostRecentCycleBoundary(pool, await clock.now(pool));
      assert.strictEqual(before.periodEnd.toISOString(), '2031-11-28T18:00:00.000Z');
      assert.strictEqual(after.periodEnd.toISOString(), '2031-12-28T18:00:00.000Z');
    });

    await check('8e. billing-monthly-cycle\'s `now` seam is an OPTIONAL second-argument context: calling handler(db) with no context is still legal (default kept for direct callers)', async () => {
      assert.strictEqual(typeof monthlyCycleJob.handler, 'function');
      // `.length` is 1 because the second parameter has a default -- that
      // default is exactly what keeps direct callers working.
      assert.strictEqual(monthlyCycleJob.handler.length, 1);
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'jobs', 'billing-monthly-cycle.job.js'), 'utf8');
      assert.ok(/async function handler\(db, \{ now = new Date\(\) \} = \{\}\)/.test(src),
        'handler must keep the (db, { now = new Date() } = {}) signature -- db first, context optional');
    });

    // ==== 9. Structural: the clock cannot reach anything financial =========

    await check('9. src/lib/clock.js imports NOTHING -- it is structurally incapable of calling CardCom, creating a donation, or sending an email', async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'clock.js'), 'utf8');
      const requires = src.match(/require\s*\(/g) || [];
      assert.deepStrictEqual(requires, [], `clock.js must have zero requires, found ${requires.length}`);
      // Checked against CODE only -- the module header deliberately names
      // donations.completed_at in prose, as the canonical example of a
      // timestamp this clock must never touch.
      const code = src.replace(/\/\/.*$/gm, '');
      assert.ok(!/provider_charged_at/.test(code), 'provider_charged_at is out of scope for Phase A');
      assert.ok(!/completed_at/.test(code), 'clock.js code must not reference completed_at');
      assert.ok(!/donations|receipts|payments|cardcom/i.test(code),
        'clock.js code must not name any financial table or provider');
    });
  } finally {
    simOff();

    // ---- cleanup ----
    if (fixture.emailLogId) {
      await pool.query(`DELETE FROM email_logs WHERE id = $1`, [fixture.emailLogId]).catch(() => {});
    }
    await pool.query(`DELETE FROM job_runs WHERE job_name IN ($1, $2)`, [TEST_JOB_ONE_ARG, TEST_JOB_TWO_ARG]).catch(() => {});
    if (fixture.simulationTableCreated) await dropSimulationClockTable().catch(() => {});

    await check('cleanup verification: zero residue -- fixture email_logs row, test job_runs rows, and the throwaway simulation_clock table are all gone', async () => {
      const [mail, runs, table] = await Promise.all([
        fixture.emailLogId
          ? pool.query(`SELECT id FROM email_logs WHERE id = $1`, [fixture.emailLogId])
          : { rows: [] },
        pool.query(`SELECT id FROM job_runs WHERE job_name IN ($1, $2)`, [TEST_JOB_ONE_ARG, TEST_JOB_TWO_ARG]),
        pool.query(`SELECT to_regclass('public.simulation_clock') AS t`),
      ]);
      assert.strictEqual(mail.rows.length, 0, 'email_logs residue');
      assert.strictEqual(runs.rows.length, 0, 'job_runs residue');
      assert.strictEqual(table.rows[0].t, null, 'simulation_clock must NOT remain in the database');
    });

    await check('cleanup verification: simulation is OFF again in this process', async () => {
      assert.strictEqual(clock.isSimulationEnabled(), false);
    });
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  await pool.query(`DROP TABLE IF EXISTS simulation_clock`).catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
