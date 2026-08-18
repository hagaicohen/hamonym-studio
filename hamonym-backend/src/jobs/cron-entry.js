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

async function main() {
  const now = new Date();

  for (const name of jobRunner.list()) {
    const job = jobRunner.get(name);
    if (!job?.schedule) continue;

    const { due, windowStart } = await checkWindow(db, job, now);

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
      console.error(`[cron-entry] ${name} run() itself threw:`, err.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[cron-entry] fatal:', err);
    process.exit(1);
  });
