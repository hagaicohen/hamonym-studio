// Cron-window semantics for the Render Cron Job trigger (docs/CARDCOM_OPERATIONAL_PROCESSES.md).
// Deliberately NOT "run if now - lastSuccess >= minGap" — that drifts a
// job's effective time-of-day forward every time it's ever delayed (see
// 2026-08-18 review). Instead: each job's `schedule` cron string still means
// what it says (e.g. "0 3 * * *" = once at 03:00 UTC, not "every ~24h from
// whenever it last happened to run"). A job is due if its most recent
// scheduled window (the latest cron match at-or-before now) has no
// successful run since that window started — this naturally catches up a
// missed window (a 08:00 check still finds an unsatisfied 03:00 window and
// runs it) without ever re-running an already-satisfied window.
//
// Only supports the field syntax this project's jobs actually use — a
// literal number, or minute-field "*/N" — not full cron (ranges, lists,
// step on other fields). Extend if a job ever needs more; no reason to carry
// a general cron parser for four known, simple schedules.
function fieldMatches(fieldStr, value) {
  if (fieldStr === '*') return true;
  if (fieldStr.startsWith('*/')) return value % Number(fieldStr.slice(2)) === 0;
  return Number(fieldStr) === value;
}

function cronMatches(schedule, date) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(' ');
  return (
    fieldMatches(minute, date.getUTCMinutes()) &&
    fieldMatches(hour, date.getUTCHours()) &&
    fieldMatches(dayOfMonth, date.getUTCDate()) &&
    fieldMatches(month, date.getUTCMonth() + 1) &&
    fieldMatches(dayOfWeek, date.getUTCDay())
  );
}
exports.cronMatches = cronMatches;

// Latest minute at-or-before `now` (UTC) that matches the schedule — the
// "current window" a due-check evaluates against. Steps backward minute by
// minute; bounded lookback (3 days) comfortably covers the daily job with
// margin without risking an unbounded loop on a malformed expression.
const MAX_LOOKBACK_MINUTES = 3 * 24 * 60;

function mostRecentWindowStart(schedule, now) {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  for (let i = 0; i < MAX_LOOKBACK_MINUTES; i++) {
    if (cronMatches(schedule, d)) return d;
    d.setUTCMinutes(d.getUTCMinutes() - 1);
  }
  return null; // schedule matches nothing in 3 days — treat as misconfigured, not "always due"
}
exports.mostRecentWindowStart = mostRecentWindowStart;

// Gap to the previous window, e.g. 15 min / 1 hour / 1 day — derived from
// the schedule itself (by finding the window just before this one) rather
// than hardcoded per job, so it stays correct if a job's schedule changes.
function intervalMsFor(schedule, windowStart) {
  const prevWindow = mostRecentWindowStart(schedule, new Date(windowStart.getTime() - 60_000));
  if (!prevWindow) return null;
  return windowStart.getTime() - prevWindow.getTime();
}
exports.intervalMsFor = intervalMsFor;

// The one shared primitive both cron-entry.js and cardcom-ops.controller.js
// evaluate — "is the current window unserviced" (due) — against the exact
// same "success since windowStart" query, so the two can never disagree
// about what "on schedule" means.
async function checkWindow(db, job, now) {
  const windowStart = mostRecentWindowStart(job.schedule, now);
  if (!windowStart) return { due: false, windowStart: null, intervalMs: null };

  const intervalMs = intervalMsFor(job.schedule, windowStart);
  const res = await db.query(
    `SELECT 1 FROM job_runs WHERE job_name = $1 AND status = 'success' AND started_at >= $2 LIMIT 1`,
    [job.name, windowStart]
  );
  const satisfied = res.rows.length > 0;

  return { due: !satisfied, windowStart, intervalMs };
}
exports.checkWindow = checkWindow;

// Staleness is a different question from "due" and needs different math.
// windowStart is always within one interval of `now` by construction (it's
// the *latest* match at-or-before now), so "now - windowStart" can never
// exceed one interval — comparing that to a multi-interval tolerance can
// never fire (caught by regression, 2026-08-18). Real overdue-ness has to be
// measured against the last time this job actually succeeded, unbounded by
// the current window — still sized off the same schedule-derived intervalMs
// the due-check uses, just a different base timestamp.
async function checkStaleness(db, job, now, toleranceMultiplier = 2) {
  const windowStart = mostRecentWindowStart(job.schedule, now);
  if (!windowStart) return { stale: false, msSinceLastSuccess: null, intervalMs: null };

  const intervalMs = intervalMsFor(job.schedule, windowStart);
  const res = await db.query(
    `SELECT MAX(started_at) AS last_success FROM job_runs WHERE job_name = $1 AND status = 'success'`,
    [job.name]
  );
  const lastSuccess = res.rows[0].last_success;
  const msSinceLastSuccess = lastSuccess ? now.getTime() - new Date(lastSuccess).getTime() : null;

  const stale = msSinceLastSuccess == null || msSinceLastSuccess > intervalMs * toleranceMultiplier;
  return { stale, msSinceLastSuccess, intervalMs };
}
exports.checkStaleness = checkStaleness;
