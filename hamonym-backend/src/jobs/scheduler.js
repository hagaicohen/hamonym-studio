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
// node-cron@4.6.0 — revised 2026-08-16. Originally pinned at 3.0.3 to avoid
// a Node 20 requirement, but that traded a real problem (this project's
// only native dependency at the time, bcrypt, was fine either way — the
// only actual reason to stay on 3.x was avoiding the version bump itself)
// for a permanent one: 3.x carries a `moderate` npm audit advisory (a
// transitive `uuid` dependency) with no fix released within that major
// line. Investigated before switching: bcrypt (the only native/compiled
// dependency in this project) declares `engines: {"node": ">=18"}` — no
// upper bound, ships for current LTS lines — so it isn't a blocker either
// way. `package.json`'s own `engines` field now requires Node >=20 to
// match. See docs/CARDCOM_OPERATIONAL_PROCESSES.md Part י' for what this
// does and doesn't establish about Render's actual configured runtime —
// this repo has no .nvmrc/render.yaml/Dockerfile, so `engines` is the only
// repo-level signal there is; whether Render's build actually picks it up
// isn't confirmed by anything short of a real deploy.
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
