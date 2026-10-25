// One monthly lifecycle; environment adapters supply scope and authorization only.
const pool = require('../../db/db');
const scope = require('../../lib/fin11-simulation-context');
const periods = require('./billing-period.util');
const calculation = require('./calculation.service');
const { autoApproveDraftStatementsForRun } = require('./approval.service');
const { recordFinding } = require('../../jobs/reconciliation-findings');
async function prepare({ db, now, previousAt, config }) {
  // Existing data/provider authorization stays intact. Time source never changes this policy.
  if (!scope.current() || scope.current().fingerprint !== config.fingerprint) throw new Error('Billing scope required');
  const boundary = await require('../../jobs/billing-monthly-cycle.job').computeMostRecentCycleBoundary(db, now);
  let existingRun;
  {
    existingRun = (await db.query(`SELECT r.id FROM billing_runs r JOIN billing_periods bp ON bp.id=r.billing_period_id
      WHERE bp.period_start=$1 AND bp.period_end=$2 AND bp.retired=false
      AND r.result_summary->>'simulation_provider'='fin11_mock' AND r.result_summary->>'simulation_identity'=$3 ORDER BY r.started_at LIMIT 1`,
      [boundary.periodStart, boundary.periodEnd, config.fingerprint])).rows[0];
    const current = await periods.resolveSelectedMonthBoundary(db, now.getUTCFullYear(), now.getUTCMonth()+1);
    if (!existingRun && now < current.periodEnd && (!previousAt || new Date(previousAt) >= boundary.periodEnd)) return { status: 'skipped', reason: 'cutoff_not_reached' };
  }
  const { periodId, periodCreated } = await periods.ensurePeriod(db, boundary.periodStart, boundary.periodEnd);
  const result = await calculation.runProductionCalculation(periodId, now.toISOString(), {
    resumeSafe: true, entityIds: config.entityIds, billingRunId: existingRun?.id,
    marker: { simulation_provider: 'fin11_mock', simulation_identity: config.fingerprint }
  });
  const autoApprovalEnabled = true; // Existing approval service still validates every statement.
  const approval = autoApprovalEnabled && !result.errors.length ? await autoApproveDraftStatementsForRun(result.billingRunId) : { approved: [], failed: [] };
  for (const failure of approval.failed) await recordFinding(db, {
    jobName: 'billing-monthly-cycle', findingType: 'statement_auto_approval_failed', severity: 'warning',
    subjectType: 'statement', subjectId: failure.statementId, details: { code: failure.code, message: failure.message }
  });
  const report = { periodId, periodStart: boundary.periodStart.toISOString(), periodEnd: boundary.periodEnd.toISOString(), periodCreated,
    calculationRan: true, billingRunId: result.billingRunId, accountsEvaluated: result.accountsEvaluated,
    statementsCreated: result.statementsCreated, blockedEntitiesCount: result.blockedEntities.length, activityDiscovered: result.activityDiscovered,
    autoApprovalEnabled, statementsAutoApproved: approval.approved.length, statementsAutoApprovalFailed: approval.failed.length };
  return { ...report, runId: result.billingRunId, reused: result.reused, skipped: [], errors: result.errors,
    approved: approval.approved.length, approvalFailed: approval.failed.map(row => ({ statementId: row.statementId, reason: row.code })),
    status: result.errors.length || approval.failed.length || result.blockedEntities.length ? 'blocked' : 'success',
    reason: result.errors.length || result.blockedEntities.length ? 'calculation_incomplete' : approval.failed.length ? 'approval_failed' : null };
}
async function execute({ db = pool, previousAt, triggeredBy = 'hamonym-clock' } = {}) {
  const config = scope.configuration();
  if (!await require('./billing-readiness').ready(db)) return { results: [{ step: 'monthly_billing', status: 'blocked', result: { reason: 'billing_migrations_required' } }] };
  const client = await db.connect();
  let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [117911074])).rows[0].acquired;
    if (!locked) return { results: [{ step: 'monthly_billing', status: 'skipped', result: { reason: 'billing_already_running' } }] };
    const now = await require('../../lib/clock').now(db);
    // Enumerate existing eligible accounts; this is not a configured authorization list.
    config.entityIds = (await db.query("SELECT entity_id FROM billing_accounts WHERE enforcement_status='active' ORDER BY entity_id")).rows.map(row => row.entity_id);
    return await scope.run({ businessAt: now.toISOString(), ...config }, async () => {
      const results = [];
      let prepared;
      try { prepared = await prepare({ db, now, previousAt, config }); }
      catch (err) { prepared = { status: 'blocked', reason: err.code || 'monthly_preparation_failed' }; }
      results.push({ step: 'monthly_billing', status: prepared.status, result: prepared });
      if (prepared.status !== 'success') return { results };
      try { results.push({ step: 'recover_mock_attempts', status: 'success', result: await require('./collection-attempt-recovery.service').recover() }); }
      catch { results.push({ step: 'recover_mock_attempts', status: 'blocked', result: { reason: 'mock_recovery_failed' } }); return { results }; }
      for (const name of ['fin11-card-collection', 'fin11-card-retry-sweep']) {
        let outcome;
        try { outcome = await require('../../jobs').run(name, { triggeredBy }); }
        catch (err) { outcome = { status: 'failed', result: { reason: err.code || 'billing_job_failed' } }; }
        results.push({ step: name, ...outcome });
        if (outcome.status !== 'success' || outcome.result?.errors) break;
      }
      return { results };
    });
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [117911074]);
    client.release();
  }
}
module.exports = { execute };
