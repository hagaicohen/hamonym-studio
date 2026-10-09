const db = require('../db/db');
const clock = require('../lib/clock');
const adminNotifications = require('../modules/email/admin-notification.service');

// Generic scheduled-job core — not Cardcom-specific. See
// docs/CARDCOM_OPERATIONAL_PROCESSES.md (Part F). Deliberately NOT wired to
// any actual periodic trigger yet (no node-cron, nothing called from
// server.js) — that's a real production-behavior change and stays an
// explicit, separate step pending review, not something bundled in here.
// Today this is only reachable by calling run() directly (a script, a
// future admin "Run now" route, or a scheduler once one is wired).

const registry = new Map();

// { name, handler, timeoutMs? } — handler is async (db, { now }) =>
// resultSummary. `db` is and stays the first argument; the second argument
// is additive, so a handler declared as `async (db) => ...` keeps working
// completely unmodified (JS ignores an argument it doesn't declare).
exports.register = (job) => {
  if (!job?.name || typeof job.handler !== 'function') {
    throw new Error('job-runner.register requires { name, handler }');
  }
  registry.set(job.name, { timeoutMs: 5 * 60 * 1000, ...job });
};

function lockKeyFor(jobName) {
  // Deterministic string hash -> 32-bit int. Collisions between two job
  // names are a real but low-probability risk at this job count (few,
  // human-named jobs) — acceptable for this scale, not for hundreds of
  // dynamic job names.
  let hash = 0;
  for (let i = 0; i < jobName.length; i++) {
    hash = (hash * 31 + jobName.charCodeAt(i)) | 0;
  }
  return hash;
}

// Runs a registered job exactly once, guarded by a Postgres advisory lock
// so a second concurrent call (another process, an overlapping schedule
// tick, an admin clicking "Run now" while the scheduler is already running
// it) skips instead of double-executing.
//
// Uses pg_try_advisory_XACT_lock on ONE dedicated client held for the
// entire run, not the plain session-level pg_try_advisory_lock on the
// shared pool — verified empirically (2026-08-15) that the naive version is
// broken with a connection pool: pool.query() for the lock and pool.query()
// for the unlock can each land on a *different* pooled connection, so (a) a
// second "concurrent" acquire can trivially succeed because it's really the
// same already-holding session reentering its own lock, and (b) the unlock
// can silently no-op on the wrong connection and leak the lock until that
// connection happens to close. A transaction-scoped lock on a single
// checked-out client has neither problem — it's released automatically on
// COMMIT/ROLLBACK, even if the process crashes mid-job.
exports.run = async (jobName, { triggeredBy = 'scheduler' } = {}) => {
  const job = registry.get(jobName);
  if (!job) throw new Error(`Unknown job: ${jobName}`);

  const lockKey = lockKeyFor(jobName);
  const lockClient = await db.connect();

  try {
    await lockClient.query('BEGIN');
    const lockRes = await lockClient.query('SELECT pg_try_advisory_xact_lock($1) AS acquired', [lockKey]);

    if (!lockRes.rows[0].acquired) {
      await lockClient.query('ROLLBACK');
      const skipRes = await db.query(
        `INSERT INTO job_runs (job_name, status, finished_at, triggered_by)
         VALUES ($1, 'skipped_locked', NOW(), $2) RETURNING id`,
        [jobName, triggeredBy]
      );
      return { runId: skipRes.rows[0].id, status: 'skipped_locked' };
    }

    const runRes = await db.query(
      `INSERT INTO job_runs (job_name, status, triggered_by) VALUES ($1, 'running', $2) RETURNING id, started_at`,
      [jobName, triggeredBy]
    );
    const runId = runRes.rows[0].id;
    const startedAt = runRes.rows[0].started_at;

    // BUSINESS time for this run, resolved exactly once so every decision
    // inside one job run is made against a single consistent instant.
    // Deliberately NOT used for job_runs.started_at/finished_at/duration_ms
    // above and below — those are operational facts about this process and
    // stay real wall-clock (`started_at` is the DB default, `finished_at` is
    // SQL NOW(), `duration_ms` comes from Date.now()) under every
    // configuration, simulation on or off. With simulation off this is a
    // plain `new Date()` and costs no query. See src/lib/clock.js.
    const businessNow = await clock.now(db);

    try {
      const result = await Promise.race([
        job.handler(db, { now: businessNow }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Job timed out')), job.timeoutMs)),
      ]);

      const durationMs = Date.now() - new Date(startedAt).getTime();
      await db.query(
        `UPDATE job_runs SET status='success', finished_at=NOW(), duration_ms=$1, result_summary=$2 WHERE id=$3`,
        [durationMs, JSON.stringify(result ?? {}), runId]
      );
      return { runId, status: 'success', result };
    } catch (err) {
      const durationMs = Date.now() - new Date(startedAt).getTime();
      await db.query(
        `UPDATE job_runs SET status='failed', finished_at=NOW(), duration_ms=$1, error=$2 WHERE id=$3`,
        [durationMs, err.message, runId]
      );

      // Admin/ops notification (event A, 2026-10-07) — fired only AFTER the
      // job_runs row is durably marked 'failed', so the email can never
      // describe a failure that no row records. Keyed on runId, which is
      // unique per real run, so a re-run (or an admin "Run now" while the
      // scheduler also runs it) produces its own alert rather than re-sending
      // this one, and nothing re-sends for this run ever again.
      //
      // queueAdminNotification is synchronous and cannot throw — the job's
      // own 'failed' result below is returned identically whether or not any
      // notification is ever delivered.
      adminNotifications.queueAdminNotification('job_run_failed', {
        incidentKey: `JOB_RUN_FAILED:${runId}`,
        data: {
          jobName,
          jobRunId: runId,
          failedAt: new Date().toISOString(),
          durationMs,
          triggeredBy,
          error: err.message,
        },
      });

      return { runId, status: 'failed', error: err.message };
    } finally {
      await lockClient.query('COMMIT'); // releases the xact lock
    }
  } finally {
    lockClient.release();
  }
};

exports.list = () => Array.from(registry.keys());

// Exposes the registered job object (name/schedule/timeoutMs/handler) — used
// by scheduler.js to read each job's `schedule` field. Not needed by
// anything before now; `.list()` alone was enough for Admin "Run now".
exports.get = (jobName) => registry.get(jobName);
