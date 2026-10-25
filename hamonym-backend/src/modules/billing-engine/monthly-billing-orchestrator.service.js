// One monthly lifecycle; environment adapters supply scope and authorization only.
const pool = require('../../db/db');
const scope = require('../../lib/fin11-simulation-context');
const periods = require('./billing-period.util');
const calculation = require('./calculation.service');
const { autoApproveDraftStatementsForRun } = require('./approval.service');
const { recordFinding } = require('../../jobs/reconciliation-findings');
async function run({ db = pool, now, previousAt, simulation = false }) {
  let config;
  if (simulation) {
    config = scope.configuration();
    if (!scope.current() || scope.current().fingerprint !== config.fingerprint) throw new Error('Simulation scope required');
    if (process.env.FIN11_SIMULATION_AUTO_APPROVAL_ENABLED !== 'true') return { status: 'blocked', reason: 'automatic_approval_not_authorized' };
  }
  const boundary = await require('../../jobs/billing-monthly-cycle.job').computeMostRecentCycleBoundary(db, now);
  let existingRun;
  if (simulation) {
    existingRun = (await db.query(`SELECT r.id FROM billing_runs r JOIN billing_periods bp ON bp.id=r.billing_period_id
      WHERE bp.period_start=$1 AND bp.period_end=$2 AND bp.retired=false
      AND r.result_summary->>'simulation_provider'='fin11_mock' AND r.result_summary->>'simulation_identity'=$3 ORDER BY r.started_at LIMIT 1`,
      [boundary.periodStart, boundary.periodEnd, config.fingerprint])).rows[0];
    const current = await periods.resolveSelectedMonthBoundary(db, now.getUTCFullYear(), now.getUTCMonth()+1);
    if (!existingRun && now < current.periodEnd && (!previousAt || new Date(previousAt) >= boundary.periodEnd)) return { status: 'skipped', reason: 'cutoff_not_reached' };
  }
  const { periodId, periodCreated } = await periods.ensurePeriod(db, boundary.periodStart, boundary.periodEnd);
  if (!simulation) existingRun = (await db.query('SELECT id,result_summary FROM billing_runs WHERE billing_period_id = $1 ORDER BY started_at LIMIT 1', [periodId])).rows[0];
  if (!simulation && existingRun && (!existingRun.result_summary?.monthly_orchestration || existingRun.result_summary?.orchestration_complete)) return { periodId, periodStart: boundary.periodStart.toISOString(), periodEnd: boundary.periodEnd.toISOString(), periodCreated, calculationRan: false, reason: 'already_calculated', existingRunId: existingRun.id };
  const result = await calculation.runProductionCalculation(periodId, now.toISOString(), simulation ? {
    resumeSafe: true, entityIds: config.entityIds, billingRunId: existingRun?.id,
    marker: { simulation_provider: 'fin11_mock', simulation_identity: config.fingerprint }
  } : { resumeSafe: true, billingRunId: existingRun?.id, marker: { monthly_orchestration: true } });
  const autoApprovalEnabled = process.env[simulation ? 'FIN11_SIMULATION_AUTO_APPROVAL_ENABLED' : 'FIN11_AUTO_APPROVAL_ENABLED'] === 'true';
  const approval = autoApprovalEnabled && (!simulation || !result.errors.length) ? await autoApproveDraftStatementsForRun(result.billingRunId) : { approved: [], failed: [] };
  for (const failure of approval.failed) await recordFinding(db, {
    jobName: 'billing-monthly-cycle', findingType: 'statement_auto_approval_failed', severity: 'warning',
    subjectType: 'statement', subjectId: failure.statementId, details: { code: failure.code, message: failure.message }
  });
  const report = { periodId, periodStart: boundary.periodStart.toISOString(), periodEnd: boundary.periodEnd.toISOString(), periodCreated,
    calculationRan: true, billingRunId: result.billingRunId, accountsEvaluated: result.accountsEvaluated,
    statementsCreated: result.statementsCreated, blockedEntitiesCount: result.blockedEntities.length, activityDiscovered: result.activityDiscovered,
    autoApprovalEnabled, statementsAutoApproved: approval.approved.length, statementsAutoApprovalFailed: approval.failed.length };
  if (!simulation) {
    await db.query("UPDATE billing_runs SET result_summary=result_summary || $2::jsonb WHERE id=$1", [result.billingRunId, JSON.stringify({ orchestration_complete: !result.errors.length && !approval.failed.length })]);
    return report;
  }
  return { ...report, runId: result.billingRunId, reused: result.reused, skipped: [], errors: result.errors,
    approved: approval.approved.length, approvalFailed: approval.failed.map(row => ({ statementId: row.statementId, reason: row.code })),
    status: result.errors.length || approval.failed.length || result.blockedEntities.length ? 'blocked' : 'success',
    reason: result.errors.length || result.blockedEntities.length ? 'calculation_incomplete' : approval.failed.length ? 'approval_failed' : null };
}
module.exports = { run };
