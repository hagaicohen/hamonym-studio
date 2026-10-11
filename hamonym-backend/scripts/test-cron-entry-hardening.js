// Regression coverage for the cron-entry.js infrastructure-failure hardening
// (2026-10-11). The bug: the heartbeat INSERT and each job's checkWindow()
// call were the only awaits in main() without a try/catch of their own, so
// one transient DB error in either reached the outer .catch() and
// process.exit(1) -- killing the whole tick, so every job registered AFTER
// the failing point never even got to ask whether it was due, although none
// of them depends on the heartbeat or on another job's due-check.
//
// The invariant these tests exist to protect: a transient heartbeat or
// checkWindow failure must never prevent all otherwise-independent jobs from
// getting their opportunity to run -- while the tick still reports a truthful
// non-zero exit status to Render, because something genuinely did fail.
//
// NO DB WRITES AND NO REAL JOB EXECUTION. The shared `db` pool singleton's
// .query/.connect are monkey-patched per scenario (restored in a finally, no
// matter what) so every SQL statement cron-entry.js and job-runner.js would
// issue is observed as a string instead of being executed -- the same
// "fake db, real production code path" approach as
// scripts/test-cardcom-ops-cadence-classification.js and
// scripts/test-collection-attempt-recovery.js. The only jobs that ever
// "run" are throwaway fixtures registered by this script.
//
// Run: node scripts/test-cron-entry-hardening.js

require('dotenv').config();
const assert = require('assert');

// Business-clock simulation forced OFF before anything requires job-runner:
// this models the real Render Cron path, where clock.now() returns a plain
// new Date() and issues zero queries (src/lib/clock.js). Leaving it to
// whatever .env happens to say would make the fake db's expected statement
// set depend on local configuration.
process.env.HAMONYM_SIMULATION_MODE = '';

require('../src/jobs/index'); // side effect: populates the real job registry
const jobRunner = require('../src/jobs/job-runner');
const db = require('../src/db/db');
const cronEntry = require('../src/jobs/cron-entry');
const { mostRecentWindowStart } = require('../src/jobs/schedule-window');
const adminNotifications = require('../src/modules/email/admin-notification.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; realLog(`PASS  ${name}`); })
    .catch((err) => { failures++; realLog(`FAIL  ${name}`); realLog('      ' + (err.stack || err.message)); });
}

const realLog = console.log.bind(console);

// ---------------------------------------------------------------------------
// Fixture jobs. Registered at the END of jobRunner.list(), so FIRST_JOB is
// evaluated before SECOND_JOB -- which is what makes "a later job still gets
// its turn after an earlier one's checkWindow failed" an ordering assertion
// and not a coincidence.
// ---------------------------------------------------------------------------
const FIRST_JOB = 'zz-test-cron-hardening-first';
const SECOND_JOB = 'zz-test-cron-hardening-second';
const SCHEDULE = '*/15 * * * *';

const handlerCalls = [];
jobRunner.register({
  name: FIRST_JOB, schedule: SCHEDULE, timeoutMs: 5000,
  handler: async () => { handlerCalls.push(FIRST_JOB); return { fixture: FIRST_JOB }; },
});
jobRunner.register({
  name: SECOND_JOB, schedule: SCHEDULE, timeoutMs: 5000,
  handler: async () => { handlerCalls.push(SECOND_JOB); return { fixture: SECOND_JOB }; },
});

const FIXTURE_JOBS = [FIRST_JOB, SECOND_JOB];
const REAL_SCHEDULED_JOBS = jobRunner.list().filter((n) => jobRunner.get(n)?.schedule && !FIXTURE_JOBS.includes(n));

// ---------------------------------------------------------------------------
// One tick, fully instrumented. Returns everything a test needs to assert on:
// the summary main() resolves to, the exit code the entry point would use,
// every captured log line, and every SQL statement that was attempted.
//
// opts:
//   heartbeatFails      - make the heartbeat INSERT reject
//   checkWindowFailsFor - set of job names whose due-check SELECT rejects
//   dueJobs             - set of job names whose window is UNsatisfied (due);
//                         every other job's SELECT returns a row (skip)
//   failingHandlers     - set of job names whose handler should throw
// ---------------------------------------------------------------------------
async function runTick({
  heartbeatFails = false,
  checkWindowFailsFor = [],
  dueJobs = [],
  failingHandlers = [],
} = {}) {
  const logs = [];
  const errors = [];
  const sql = [];
  let nextRunId = 9000;

  const originalQuery = db.query;
  const originalConnect = db.connect;
  const originalLog = console.log;
  const originalError = console.error;
  const originalNotify = adminNotifications.queueAdminNotification;
  const originalHandlers = new Map();

  for (const name of failingHandlers) {
    const job = jobRunner.get(name);
    originalHandlers.set(name, job.handler);
    job.handler = async () => { handlerCalls.push(name); throw new Error(`fixture handler failure in ${name}`); };
  }

  const notifications = [];
  // Stubbed so job-runner's observability call cannot reach email_logs or
  // the real `users` table from a test. Call count is itself asserted (case H).
  adminNotifications.queueAdminNotification = (event, payload) => { notifications.push({ event, payload }); };

  console.log = (...args) => { const line = args.map(String).join(' '); logs.push(line); };
  console.error = (...args) => { const line = args.map(String).join(' '); errors.push(line); };

  db.query = async (text, params) => {
    sql.push({ text, params });

    if (text.includes("'scheduler-heartbeat'")) {
      if (heartbeatFails) throw new Error('simulated heartbeat DB failure');
      return { rows: [], rowCount: 1 };
    }

    // schedule-window.checkWindow's due-check
    if (text.includes("status = 'success'") && text.includes('started_at >=')) {
      const jobName = params[0];
      if (checkWindowFailsFor.includes(jobName)) throw new Error(`simulated checkWindow DB failure for ${jobName}`);
      return { rows: dueJobs.includes(jobName) ? [] : [{ '?column?': 1 }] };
    }

    if (text.includes("VALUES ($1, 'running', $2)")) {
      return { rows: [{ id: ++nextRunId, started_at: new Date() }] };
    }
    if (text.includes('UPDATE job_runs SET')) return { rows: [], rowCount: 1 };
    if (text.includes("'skipped_locked'")) return { rows: [{ id: ++nextRunId }] };

    throw new Error(`fake db received an UNEXPECTED statement: ${text.slice(0, 120)}`);
  };

  db.connect = async () => ({
    query: async (text) => {
      sql.push({ text, params: null, viaLockClient: true });
      if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
      return { rows: [] };
    },
    release: () => {},
  });

  try {
    const summary = await cronEntry.main();
    return {
      summary,
      exitCode: cronEntry.exitCodeFor(summary),
      logs,
      errors,
      allLines: [...logs, ...errors],
      sql,
      notifications,
    };
  } finally {
    db.query = originalQuery;
    db.connect = originalConnect;
    console.log = originalLog;
    console.error = originalError;
    adminNotifications.queueAdminNotification = originalNotify;
    for (const [name, handler] of originalHandlers) jobRunner.get(name).handler = handler;
  }
}

function evaluatedJobs(tick) {
  // A job was "evaluated" this tick if cron-entry reached a decision about it:
  // it issued its due-check (or that due-check failed loudly).
  const names = new Set();
  for (const { text, params } of tick.sql) {
    if (text.includes("status = 'success'") && text.includes('started_at >=')) names.add(params[0]);
  }
  for (const line of tick.errors) {
    const m = line.match(/^\[cron-entry\] (\S+): checkWindow failed:/);
    if (m) names.add(m[1]);
  }
  return names;
}

async function main() {
  // =========================================================================
  // (A) Heartbeat DB failure: the tick continues, jobs still get their turn.
  // =========================================================================
  await check('A: heartbeat insert failure does NOT end the tick -- every scheduled job is still evaluated', async () => {
    handlerCalls.length = 0;
    const tick = await runTick({ heartbeatFails: true, dueJobs: [SECOND_JOB] });

    const evaluated = evaluatedJobs(tick);
    for (const name of [...REAL_SCHEDULED_JOBS, ...FIXTURE_JOBS]) {
      assert(evaluated.has(name), `${name} must still have been evaluated despite the heartbeat failure`);
    }
    assert.deepStrictEqual(handlerCalls, [SECOND_JOB], 'the due job must still have actually run');
    assert.deepStrictEqual(tick.summary.infraFailures, [{ stage: 'heartbeat', error: 'simulated heartbeat DB failure' }]);
  });

  await check('A: the failed heartbeat attempt is still loudly visible in the log (its diagnostic purpose survives) and tagged with its stage', async () => {
    const tick = await runTick({ heartbeatFails: true });
    const line = tick.errors.find((l) => l.startsWith('[cron-entry] heartbeat insert failed:'));
    assert(line, `expected a "[cron-entry] heartbeat insert failed:" line, got: ${JSON.stringify(tick.errors)}`);
    assert.strictEqual(line, '[cron-entry] heartbeat insert failed: simulated heartbeat DB failure');
  });

  await check('A: a heartbeat failure writes NO job_runs heartbeat row -- "the trigger did not complete a heartbeat" still means exactly that', async () => {
    const tick = await runTick({ heartbeatFails: true });
    const attempted = tick.sql.filter((s) => s.text.includes("'scheduler-heartbeat'"));
    assert.strictEqual(attempted.length, 1, 'the insert must still be attempted exactly once per tick');
    assert(/INSERT INTO job_runs/.test(attempted[0].text), 'and it must still be the same unconditional INSERT');
  });

  // =========================================================================
  // (B) One job's checkWindow fails: that job is skipped, the loop continues.
  // =========================================================================
  await check('B: a job whose checkWindow() throws is skipped for the tick -- it does not run, and it is not treated as due', async () => {
    handlerCalls.length = 0;
    const tick = await runTick({ checkWindowFailsFor: [FIRST_JOB], dueJobs: [FIRST_JOB, SECOND_JOB] });

    assert(!handlerCalls.includes(FIRST_JOB), 'the job whose due-check failed must NOT run -- due-ness is unknown, not assumed');
    assert(!tick.allLines.some((l) => l.includes(`${FIRST_JOB}: window`)), 'it must produce neither a "due, running" nor an "already satisfied" line');
    assert.deepStrictEqual(tick.summary.infraFailures, [
      { stage: 'checkWindow', job: FIRST_JOB, error: `simulated checkWindow DB failure for ${FIRST_JOB}` },
    ]);
  });

  await check('B: the failure is logged with BOTH the job name and the stage tag', async () => {
    const tick = await runTick({ checkWindowFailsFor: [FIRST_JOB] });
    const line = tick.errors.find((l) => l.includes('checkWindow failed'));
    assert.strictEqual(line, `[cron-entry] ${FIRST_JOB}: checkWindow failed: simulated checkWindow DB failure for ${FIRST_JOB}`);
  });

  // =========================================================================
  // (C) The ordering guarantee: a LATER job still runs after an EARLIER one's
  //     checkWindow failed in the same tick. This is the actual bug.
  // =========================================================================
  await check('C: a later-registered independent job still runs normally after an earlier job\'s checkWindow() failure in the same tick', async () => {
    handlerCalls.length = 0;
    const order = jobRunner.list();
    assert(order.indexOf(FIRST_JOB) < order.indexOf(SECOND_JOB), 'fixture precondition: FIRST_JOB is evaluated before SECOND_JOB');

    const tick = await runTick({ checkWindowFailsFor: [FIRST_JOB], dueJobs: [SECOND_JOB] });

    assert.deepStrictEqual(handlerCalls, [SECOND_JOB], 'the later job must have actually executed');
    assert(tick.logs.some((l) => l.startsWith(`[cron-entry] ${SECOND_JOB}: window`) && l.endsWith('due, running')));
    assert(tick.logs.some((l) => l.startsWith(`[cron-entry] ${SECOND_JOB} finished:`)));
    assert(evaluatedJobs(tick).has(SECOND_JOB));
  });

  await check('C: with the heartbeat AND the first job both failing, every remaining job is still evaluated and the due one still runs', async () => {
    handlerCalls.length = 0;
    const tick = await runTick({ heartbeatFails: true, checkWindowFailsFor: [FIRST_JOB], dueJobs: [SECOND_JOB] });

    const evaluated = evaluatedJobs(tick);
    for (const name of [...REAL_SCHEDULED_JOBS, SECOND_JOB]) {
      assert(evaluated.has(name), `${name} must still be evaluated after two earlier infrastructure failures`);
    }
    assert.deepStrictEqual(handlerCalls, [SECOND_JOB]);
    assert.strictEqual(tick.summary.infraFailures.length, 2);
  });

  await check('C: even when EVERY real job\'s checkWindow fails, the loop still reaches and runs the last job', async () => {
    handlerCalls.length = 0;
    const tick = await runTick({
      heartbeatFails: true,
      checkWindowFailsFor: [...REAL_SCHEDULED_JOBS, FIRST_JOB],
      dueJobs: [SECOND_JOB],
    });
    assert.deepStrictEqual(handlerCalls, [SECOND_JOB], 'the last job must still get its opportunity');
    assert.strictEqual(tick.summary.infraFailures.length, REAL_SCHEDULED_JOBS.length + 2);
  });

  // =========================================================================
  // (D) Log content is distinguishable per stage and per job.
  // =========================================================================
  await check('D: the two failure stages produce distinct, self-identifying log lines in one tick', async () => {
    const tick = await runTick({
      heartbeatFails: true,
      checkWindowFailsFor: [FIRST_JOB, SECOND_JOB],
    });

    const heartbeatLines = tick.errors.filter((l) => l.includes('heartbeat insert failed'));
    const windowLines = tick.errors.filter((l) => l.includes('checkWindow failed'));

    assert.strictEqual(heartbeatLines.length, 1, 'exactly one heartbeat-stage line');
    assert.strictEqual(windowLines.length, 2, 'one checkWindow-stage line per affected job');
    assert(heartbeatLines[0].startsWith('[cron-entry] heartbeat insert failed:'));
    assert(!heartbeatLines[0].includes('checkWindow'), 'the heartbeat line must not be confusable with a job line');
    assert(windowLines.some((l) => l.startsWith(`[cron-entry] ${FIRST_JOB}: checkWindow failed:`)));
    assert(windowLines.some((l) => l.startsWith(`[cron-entry] ${SECOND_JOB}: checkWindow failed:`)));
    for (const l of [...heartbeatLines, ...windowLines]) {
      assert(/: simulated .* failure/.test(l), `the real error message must be present, not swallowed: ${l}`);
    }
  });

  await check('D: the recorded infraFailures carry machine-readable stage/job context, not just prose', async () => {
    const tick = await runTick({ heartbeatFails: true, checkWindowFailsFor: [SECOND_JOB] });
    assert.deepStrictEqual(tick.summary.infraFailures, [
      { stage: 'heartbeat', error: 'simulated heartbeat DB failure' },
      { stage: 'checkWindow', job: SECOND_JOB, error: `simulated checkWindow DB failure for ${SECOND_JOB}` },
    ]);
  });

  // =========================================================================
  // (E) Exit-status semantics: deterministic, independent of which jobs were
  //     due.
  // =========================================================================
  const EXIT_CASES = [
    ['clean tick, nothing due', { dueJobs: [] }, 0],
    ['clean tick, one job due', { dueJobs: [SECOND_JOB] }, 0],
    ['clean tick, every job due', { dueJobs: [...REAL_SCHEDULED_JOBS, ...FIXTURE_JOBS] }, 0],
    ['heartbeat failed, nothing due', { heartbeatFails: true, dueJobs: [] }, 1],
    ['heartbeat failed, one job due', { heartbeatFails: true, dueJobs: [SECOND_JOB] }, 1],
    ['one checkWindow failed, nothing else due', { checkWindowFailsFor: [FIRST_JOB], dueJobs: [] }, 1],
    ['one checkWindow failed, another job due', { checkWindowFailsFor: [FIRST_JOB], dueJobs: [SECOND_JOB] }, 1],
    ['heartbeat + checkWindow both failed', { heartbeatFails: true, checkWindowFailsFor: [FIRST_JOB], dueJobs: [SECOND_JOB] }, 1],
  ];
  for (const [label, opts, expected] of EXIT_CASES) {
    await check(`E: exit code ${expected} -- ${label}`, async () => {
      handlerCalls.length = 0;
      const tick = await runTick(opts);
      assert.strictEqual(tick.exitCode, expected, `expected exit ${expected}, got ${tick.exitCode} (infraFailures: ${JSON.stringify(tick.summary.infraFailures)})`);
    });
  }

  await check('E: the exit code is a pure function of the recorded infrastructure failures', async () => {
    assert.strictEqual(cronEntry.exitCodeFor({ infraFailures: [] }), 0);
    assert.strictEqual(cronEntry.exitCodeFor({ infraFailures: [{ stage: 'heartbeat' }] }), 1);
    assert.strictEqual(cronEntry.exitCodeFor({ infraFailures: [{ stage: 'checkWindow', job: 'x' }] }), 1);
    assert.strictEqual(cronEntry.EXIT_OK, 0);
    assert.strictEqual(cronEntry.EXIT_DEGRADED, 1);
  });

  // =========================================================================
  // (F)/(G) A fully normal tick is byte-for-byte what it was before.
  // =========================================================================
  await check('F: a fully normal tick (one job due, several not due) exits 0 and records zero infrastructure failures', async () => {
    handlerCalls.length = 0;
    const tick = await runTick({ dueJobs: [SECOND_JOB] });

    assert.deepStrictEqual(tick.summary.infraFailures, []);
    assert.strictEqual(tick.exitCode, 0);
    assert.strictEqual(tick.errors.length, 0, `a clean tick must log nothing to stderr, got: ${JSON.stringify(tick.errors)}`);
    assert.deepStrictEqual(handlerCalls, [SECOND_JOB]);

    const notDue = [...REAL_SCHEDULED_JOBS, FIRST_JOB];
    for (const name of notDue) {
      assert(tick.logs.some((l) => l.startsWith(`[cron-entry] ${name}: window `) && l.endsWith(' already satisfied, skipping')),
        `${name} must still produce the unchanged skip line`);
    }
    assert(tick.logs.some((l) => l === `[cron-entry] ${SECOND_JOB} finished: {"runId":9001,"status":"success","result":{"fixture":"${SECOND_JOB}"}}`),
      `expected the unchanged "finished" line, got: ${JSON.stringify(tick.logs.filter((l) => l.includes('finished')))}`);
  });

  await check('G: "window already satisfied, skipping" is the EXACT same line as before -- full string equality against an independently computed windowStart', async () => {
    const tick = await runTick({ dueJobs: [] });
    const job = jobRunner.get(FIRST_JOB);
    // cron-entry builds `now` itself; recomputing the window from the real
    // primitive is safe because '*/15 * * * *' windows are 15 minutes wide and
    // a tick takes milliseconds -- assert membership of the two adjacent
    // candidates rather than racing a boundary.
    const candidates = [new Date(), new Date(Date.now() - 1000)]
      .map((d) => mostRecentWindowStart(job.schedule, d).toISOString());
    const line = tick.logs.find((l) => l.startsWith(`[cron-entry] ${FIRST_JOB}: window `));
    assert(line, 'the skip line must exist');
    assert(candidates.some((w) => line === `[cron-entry] ${FIRST_JOB}: window ${w} already satisfied, skipping`),
      `unexpected skip line: ${line} (expected one of ${JSON.stringify(candidates)})`);
    assert.strictEqual(tick.exitCode, 0);
  });

  await check('G: a clean tick still writes exactly one heartbeat row, before any job is evaluated', async () => {
    const tick = await runTick({ dueJobs: [] });
    const heartbeatIdx = tick.sql.findIndex((s) => s.text.includes("'scheduler-heartbeat'"));
    const firstDueCheckIdx = tick.sql.findIndex((s) => s.text.includes('started_at >='));
    assert(heartbeatIdx >= 0 && firstDueCheckIdx > heartbeatIdx, 'heartbeat must still be written first, unconditionally');
    assert.strictEqual(tick.sql.filter((s) => s.text.includes("'scheduler-heartbeat'")).length, 1);
  });

  await check('G: frozen jobs (schedule falsy) are still skipped before any query -- unchanged', async () => {
    const tick = await runTick({ dueJobs: [] });
    const frozen = jobRunner.list().filter((n) => !jobRunner.get(n)?.schedule);
    assert(frozen.length > 0, 'precondition: some jobs are frozen');
    const evaluated = evaluatedJobs(tick);
    for (const name of frozen) {
      assert(!evaluated.has(name), `${name} has no schedule and must never be due-checked`);
    }
  });

  // =========================================================================
  // (H) A job's OWN handler failure: exactly the pre-existing semantics.
  // =========================================================================
  await check('H: a job handler that throws is still caught inside job-runner, still recorded as job_runs status=\'failed\', and does NOT affect the exit code', async () => {
    handlerCalls.length = 0;
    const tick = await runTick({ dueJobs: [SECOND_JOB], failingHandlers: [SECOND_JOB] });

    assert.deepStrictEqual(handlerCalls, [SECOND_JOB], 'the handler must still have been invoked');

    const failedUpdate = tick.sql.find((s) => s.text.includes("UPDATE job_runs SET status='failed'"));
    assert(failedUpdate, `expected the status='failed' UPDATE, got: ${JSON.stringify(tick.sql.map((s) => s.text.slice(0, 60)))}`);
    assert(failedUpdate.params.includes(`fixture handler failure in ${SECOND_JOB}`), 'the real error message must still be persisted');
    assert(!tick.sql.some((s) => s.text.includes("UPDATE job_runs SET status='success'")), 'nothing may be marked success');

    assert.deepStrictEqual(tick.summary.infraFailures, [], 'a handler failure is NOT an infrastructure failure of the tick');
    assert.strictEqual(tick.exitCode, 0, 'a job\'s own handler failure must still leave the exit code at 0 -- unchanged behavior');

    assert.strictEqual(tick.notifications.length, 1, 'the existing job_run_failed admin notification must still fire exactly once');
    assert.strictEqual(tick.notifications[0].event, 'job_run_failed');

    assert(tick.logs.some((l) => l.startsWith(`[cron-entry] ${SECOND_JOB} finished:`) && l.includes('"status":"failed"')),
      'cron-entry must still log the failed result as an ordinary finished run, not as a cron-entry error');
    assert(!tick.errors.some((l) => l.includes('run() itself threw')), 'run() must not have thrown -- it caught the handler failure, as before');
  });

  await check('H: a handler failure does not stop the loop either -- a job after it is still evaluated (pre-existing behavior, re-proven)', async () => {
    handlerCalls.length = 0;
    const tick = await runTick({ dueJobs: [FIRST_JOB, SECOND_JOB], failingHandlers: [FIRST_JOB] });
    assert.deepStrictEqual(handlerCalls, [FIRST_JOB, SECOND_JOB]);
    assert.strictEqual(tick.exitCode, 0);
  });

  realLog(`\n${passed} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  realLog('FATAL ' + (err.stack || err.message));
  process.exit(1);
});
