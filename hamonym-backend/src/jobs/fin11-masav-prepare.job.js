// FIN-11 Stage 4 — scheduled MASAV complementary-proposal preparation
// (2026-10). docs/finance/FIN11_STAGE4_TECHNICAL_DESIGN.md has the full
// design.
//
// NOT REGISTERED in src/jobs/index.js — see fin11-card-collection.job.js's
// header for the activation convention. Unlike that job and the retry
// sweep, this one is LOW-RISK even if accidentally wired: it only calls
// prepareMasavProposal (Stage 3, pure prepare/refresh — confirmed
// idempotent by Stage 3's own test suite, test #15/#15a: "idempotent
// re-run with unchanged balance returns the same proposal, not a
// duplicate"). It never approves, never exports, never moves money —
// approval and export to Tranzila stay an explicit, manual Super Admin
// action (masav-ops.controller.js), unchanged by this job. Still left
// unregistered, same as the others, because "do not activate production
// jobs" was explicit for this whole stage, not qualified by risk level.
//
// Timing: targets the period whose cutoff (28th 20:00 Israel) was in the
// PREVIOUS Israel calendar month relative to today — i.e. on the 6th,
// complements the card collection that already ran on the 28th of the
// month before. Reuses billing-period.util.js#resolveSelectedMonthBoundary
// verbatim (same function billing-monthly-cycle.job.js and the Platform
// Admin "בחר חודש" UI both already use) — no new period/cutoff math is
// introduced, only the "which month is 'last month' in Israel" step, which
// uses Intl to FORMAT the current instant into its Israel calendar date
// (not to build one FROM a zone, which Intl cannot do — see that file's
// own comment on why it uses Postgres AT TIME ZONE for the cutoff INSTANT
// itself; this job only ever needs to read the current date, not build a
// new wall-clock instant, so Intl is the right, simpler tool here).
//
// Does not need hour-level DST precision the way the card job's actual
// cutoff does -- preparing a proposal a few hours early or late changes
// nothing financially (prepareMasavProposal recomputes the real balance
// fresh every time it runs), so a plain UTC-day-6 cron tick is sufficient;
// the Israel-month lookup below is about WHICH period, not WHEN today is.
const { ACTIONABLE_STATEMENT_STATUSES } = require('../modules/collection-engine/collection.service');
const { resolveSelectedMonthBoundary } = require('../modules/billing-engine/billing-period.util');
const { prepareMasavProposalsForStatements } = require('../modules/billing-engine/masav-proposal.service');

function previousIsraelYearMonth(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

async function handler(db, { now = new Date() } = {}) {
  const { year, month } = previousIsraelYearMonth(now);
  const { periodEnd } = await resolveSelectedMonthBoundary(db, year, month);

  const periodRes = await db.query(
    `SELECT id FROM billing_periods WHERE period_end = $1 AND retired = false`,
    [periodEnd]
  );
  if (!periodRes.rows[0]) {
    return { reason: 'period_not_found', periodEnd: periodEnd.toISOString(), statementsConsidered: 0, proposalsPrepared: 0 };
  }
  const periodId = periodRes.rows[0].id;

  const statementsRes = await db.query(
    `SELECT id FROM statements WHERE billing_period_id = $1 AND status = ANY($2::text[])`,
    [periodId, ACTIONABLE_STATEMENT_STATUSES]
  );
  const statementIds = statementsRes.rows.map((r) => r.id);

  const results = await prepareMasavProposalsForStatements(statementIds);
  const proposalsPrepared = results.filter((r) => r.proposed).length;

  return {
    periodId,
    periodEnd: periodEnd.toISOString(),
    statementsConsidered: statementIds.length,
    proposalsPrepared,
    notProposed: results.length - proposalsPrepared,
  };
}

module.exports = {
  name: 'fin11-masav-prepare',
  schedule: '0 * 6 * *',
  timeoutMs: 5 * 60 * 1000,
  handler,
  previousIsraelYearMonth, // exported for tests
};
