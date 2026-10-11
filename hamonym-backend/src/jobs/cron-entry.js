// Entry point for a Render Cron Job (docs/CARDCOM_OPERATIONAL_PROCESSES.md,
// Part י' revised 2026-08-18) — replaces the in-process node-cron scheduler
// (scheduler.js/server.js's ENABLE_JOB_SCHEDULER), which turned out to be
// unreliable on a Web Service that Render can spin down after 15 minutes of
// no inbound HTTP traffic: while asleep, no in-process timer runs either, so
// a job due at 03:00 could simply never fire (confirmed 2026-08-18 — a real
// ~16-hour gap with zero job_runs, on an otherwise-correctly-wired
// scheduler). A Render Cron Job runs as its own separate process on Render's
// own trigger, independent of the Web Service's sleep state.
//
// One Cron Job, not four — Render bills each Cron Job service separately
// (real minimum cost), and the four jobs' own schedules (15 min / hourly /
// hourly / daily) don't need four separate triggers. Render invokes this
// script every 15 minutes (the tightest of the four); each invocation checks
// every registered job's own schedule via schedule-window.js and only
// actually runs the ones whose current window isn't satisfied yet — see that
// file for why this is schedule-window due-checking, not elapsed-time-since-
// last-run.
//
// Reuses job-runner.js's run() exactly as scheduler.js and the Admin
// "Run now" button already do — same advisory lock, same job_runs row
// shape, nothing job-specific lives in this file.
require('./index'); // side effect: populates the job registry
const jobRunner = require('./job-runner');
const db = require('../db/db');
const { checkWindow } = require('./schedule-window');

// Infrastructure-failure hardening (2026-10-11). Before this, the heartbeat
// INSERT and each job's checkWindow() call were the only two awaits in main()
// with no try/catch of their own, so a single transient DB error in either
// propagated to the outer .catch() and process.exit(1) -- ending the whole
// tick. Every job AFTER the failing point then never even got to ask whether
// it was due, although none of them depends on the heartbeat or on another
// job's due-check. Empirically consistent with an observed 2026-10-11T12:15Z
// tick that produced ZERO job_runs rows of any kind (not even a heartbeat)
// between two entirely normal ticks; Render's own process log for that
// invocation is not available, so this is the best available explanation for
// that specific incident, not a proven account of it.
//
// The fix deliberately does NOT make the tick silently "succeed": each
// protected failure is logged with its own stage tag AND recorded, so an
// otherwise-completed tick in which infrastructure failed still exits
// non-zero for Render's own monitoring. Exit-code policy follows the
// repo's existing `process.exit(failures > 0 ? 1 : 0)` convention (the
// scripts/test-*.js harnesses) rather than inventing a new scheme.
//
// Explicitly out of scope: jobRunner.run() throwing. That is already caught
// per-job below and already does not affect the exit code, by design -- a
// job's own handler failing is a business-logic outcome recorded in
// job_runs (status='failed') plus an admin notification, not an
// infrastructure fault of this tick. That behavior is unchanged here.
const EXIT_OK = 0;
const EXIT_DEGRADED = 1;

function exitCodeFor(summary) {
  return summary.infraFailures.length > 0 ? EXIT_DEGRADED : EXIT_OK;
}

async function main() {
  const now = new Date();

  // Stages of this tick that failed at the infrastructure level (the
  // heartbeat write, a job's due-check). Collected rather than thrown so the
  // loop always completes, then mapped to the process exit code once.
  const infraFailures = [];

  // Heartbeat -- proves the Render Cron Job process itself executed this
  // script just now, independent of whether any registered job happened to
  // be due this tick. Written unconditionally, before the per-job loop, and
  // NOT through job-runner.js's registry/advisory-lock machinery (this is
  // not a "job": no handler, nothing to lock, and registering it would make
  // it appear as a runnable job in the Admin "Run now" UI). See
  // cardcom-ops.controller.js's schedulerHeartbeat -- added 2026-09-08 to
  // distinguish "the trigger itself isn't firing at all" from "a specific
  // job's own logic is stale/failing", which per-job staleness alone cannot
  // tell apart (10 days of total silence, 2026-08-28 to 2026-09-07, showed
  // up only as 8 separate job_stale alerts with no single signal pointing
  // at the actual root cause).
  //
  // Failing to write it no longer ends the tick: the heartbeat is diagnostic
  // bookkeeping about the trigger, never a precondition for a job being
  // independently useful. Its diagnostic purpose is preserved on both sides
  // -- a missing row still means "the trigger did not complete a heartbeat",
  // which is exactly what the heartbeat exists to say, and the attempt is
  // still loudly visible in the process log plus the non-zero exit below, so
  // the failure is never silent.
  try {
    await db.query(
      `INSERT INTO job_runs (job_name, status, finished_at, triggered_by, result_summary)
       VALUES ('scheduler-heartbeat', 'success', NOW(), 'render-cron', '{}')`
    );
  } catch (err) {
    console.error('[cron-entry] heartbeat insert failed:', err.message);
    infraFailures.push({ stage: 'heartbeat', error: err.message });
  }

  for (const name of jobRunner.list()) {
    const job = jobRunner.get(name);
    if (!job?.schedule) continue;

    // Per-job, inside the loop: one job's due-check hitting a transient DB
    // error must cost only that job its turn this tick, never the turns of
    // the jobs registered after it -- they share nothing with it but the
    // connection pool.
    let due;
    let windowStart;
    try {
      ({ due, windowStart } = await checkWindow(db, job, now));
    } catch (err) {
      console.error(`[cron-entry] ${name}: checkWindow failed:`, err.message);
      infraFailures.push({ stage: 'checkWindow', job: name, error: err.message });
      continue;
    }

    if (!due) {
      console.log(`[cron-entry] ${name}: window ${windowStart?.toISOString()} already satisfied, skipping`);
      continue;
    }

    console.log(`[cron-entry] ${name}: window ${windowStart?.toISOString()} due, running`);
    try {
      const result = await jobRunner.run(name, { triggeredBy: 'render-cron' });
      console.log(`[cron-entry] ${name} finished:`, JSON.stringify(result));
    } catch (err) {
      // job-runner.run() already catches handler errors into job_runs
      // (status='failed') — this only guards the near-impossible case
      // where run() itself throws before reaching its own try/catch, so
      // one job's failure here can't stop the loop from checking the rest.
      // Deliberately NOT recorded in infraFailures: this has never affected
      // the exit code and must not start now (see the header note).
      console.error(`[cron-entry] ${name} run() itself threw:`, err.message);
    }
  }

  return { infraFailures };
}

// Only self-executes as the Render Cron entry point; requiring this module
// (scripts/test-cron-entry-hardening.js) exposes main()/exitCodeFor() for
// assertion without running a tick or exiting the test process.
if (require.main === module) {
  main()
    .then((summary) => {
      if (summary.infraFailures.length > 0) {
        console.error(
          `[cron-entry] tick completed with ${summary.infraFailures.length} infrastructure failure(s):`,
          JSON.stringify(summary.infraFailures)
        );
      }
      process.exit(exitCodeFor(summary));
    })
    .catch((err) => {
      // Still here for anything outside the two protected stages — an
      // unexpected throw from the registry itself, a bug in this file.
      console.error('[cron-entry] fatal:', err);
      process.exit(EXIT_DEGRADED);
    });
}

module.exports = { main, exitCodeFor, EXIT_OK, EXIT_DEGRADED };
