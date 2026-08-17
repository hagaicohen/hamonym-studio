const db = require('../db/db');

// Generic scheduled-job core — not Cardcom-specific. See
// docs/CARDCOM_OPERATIONAL_PROCESSES.md (Part F). Deliberately NOT wired to
// any actual periodic trigger yet (no node-cron, nothing called from
// server.js) — that's a real production-behavior change and stays an
// explicit, separate step pending review, not something bundled in here.
// Today this is only reachable by calling run() directly (a script, a
// future admin "Run now" route, or a scheduler once one is wired).

const registry = new Map();

// { name, handler, timeoutMs? } — handler is async (db) => resultSummary.
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

    try {
      const result = await Promise.race([
        job.handler(db),
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
