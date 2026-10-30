// Shared FIN-11 preparation-only step. Registered with the effective-clock
// scheduler and invoked by Admin clock orchestration. Israel-local day 6
// enables preparation for the previous closing month and older open debt.
// Existing proposal service owns locks, live balance, mandate checks and
// idempotency. No approval, export, provider operation or payment is performed.
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
  const day = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', day: 'numeric' }).format(now));
  if (day < 6) return { status: 'skipped', reason: 'masav_date_not_reached', statementsConsidered: 0, proposalsPrepared: 0 };
  const { year, month } = previousIsraelYearMonth(now);
  const { periodEnd } = await resolveSelectedMonthBoundary(db, year, month);

  // Include older open debt for safe catch-up; never reopen settled Statements.
  const statementsRes = await db.query(
    `SELECT s.id FROM statements s JOIN billing_periods bp ON bp.id=s.billing_period_id
     WHERE bp.period_end <= $1 AND bp.retired=false AND s.status=ANY($2::text[])`,
    [periodEnd, ACTIONABLE_STATEMENT_STATUSES]
  );
  const statementIds = statementsRes.rows.map(row => row.id);

  const results = await prepareMasavProposalsForStatements(statementIds);
  const proposalsPrepared = results.filter((r) => r.proposed).length;

  return {
    status: results.some(row => !row.proposed && !['no_outstanding_balance', 'not_actionable', 'awaiting_masav_results'].includes(row.reason)) ? 'blocked' : 'success',
    results,
    periodEnd: periodEnd.toISOString(),
    statementsConsidered: statementIds.length,
    proposalsPrepared,
    notProposed: results.length - proposalsPrepared,
  };
}

module.exports = {
  name: 'fin11-masav-prepare',
  // Hourly catch-up with an Israel-local 6th-day gate in the handler. Preparation only.
  schedule: '0 * * * *',
  timeoutMs: 5 * 60 * 1000,
  handler,
  validateResult(result) {
    if (result?.status === 'blocked') throw Object.assign(new Error('MASAV preparation blocked: ' + result.results.filter(row => !row.proposed).map(row => row.reason).join(', ')), { resultSummary: result });
  },
  previousIsraelYearMonth, // exported for tests
};
