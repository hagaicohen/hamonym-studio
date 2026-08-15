// Thin in-process scheduler (Operational Policy, 2026-08-16) — wires the
// four registered jobs (src/jobs/index.js) to real periodic triggers via
// node-cron, using each job's own `schedule` field (added 2026-08-15 as
// documentation only, now load-bearing). No new locking or error-handling
// lives here: every tick just calls the same jobRunner.run() that Admin
// "Run now" already uses (cardcom-ops.controller.js), so the Postgres
// advisory lock in job-runner.js is the only thing that ever decides
// whether a given tick actually executes — identical behavior whether the
// trigger was a cron tick, a manual Run now, or both racing each other.
//
// Deliberately does NOT run a job immediately on start() (no `runOnInit`):
// a deploy can happen several times in quick succession during normal
// development, and firing all four jobs (including one that calls Cardcom
// for real) on every restart is wasteful and reads as flapping in
// `job_runs`. Waits for each job's natural next tick instead — worst case
// gap after a deploy is 15 minutes (webhook-recovery).
//
// See docs/CARDCOM_OPERATIONAL_PROCESSES.md Part ה'/י' for why this stays
// a timer wired to already-proven infrastructure, not a new subsystem:
// deploy/restart behavior, multi-instance safety, and the advisory lock
// itself are all explained there, not re-derived here.
// node-cron pinned at 3.0.3, not the current 4.x — 4.x requires Node >=20,
// this project runs Node 18. `npm audit` flags 3.0.3 as `moderate` via a
// transitive `uuid` dependency ("missing buffer bounds check when a buffer
// is explicitly provided") — not reachable through this file's only usage
// (`cron.schedule(expression, callback)` never passes a buffer anywhere
// near uuid). No fix exists within the 3.x line; the only `npm audit`
// remedy is the 4.x major bump, which breaks Node 18 compatibility.
// Explicit decision (Operational Policy, 2026-08-16): stay on 3.0.3 now,
// revisit alongside a Node 20+ upgrade (tracked separately, not part of
// this work) — not deferred by accident.
require('./index'); // side effect: populates the job registry
const cron = require('node-cron');
const jobRunner = require('./job-runner');

let tasks = [];

exports.start = () => {
  if (tasks.length > 0) return; // already running — idempotent, safe to call twice
  for (const name of jobRunner.list()) {
    const job = jobRunner.get(name);
    if (!job?.schedule) continue;
    const task = cron.schedule(job.schedule, () => {
      jobRunner.run(name, { triggeredBy: 'scheduler' }).catch((err) => {
        // job-runner.run() already catches handler errors and records them
        // to job_runs (status='failed') — this only guards the
        // near-impossible case where run() itself throws before reaching
        // its own try/catch (e.g. the DB pool is fully unreachable), so a
        // scheduler tick can never become an unhandled promise rejection
        // that could crash the process.
        console.error(`[scheduler] ${name} run() itself threw:`, err.message);
      });
    });
    tasks.push(task);
  }
  console.log(`[scheduler] started ${tasks.length} job schedule(s): ${jobRunner.list().filter(n => jobRunner.get(n)?.schedule).join(', ')}`);
};

// Stops scheduling NEW ticks — does not wait for or abort a run already in
// flight. job-runner.js's own timeoutMs bounds how long that can take, and
// its advisory lock is transaction-scoped, so it releases automatically
// even if the process is killed mid-run (verified empirically, 2026-08-15).
exports.stop = () => {
  for (const task of tasks) task.stop();
  tasks = [];
};
