// Collection Attempt Reconciliation (2026-08-28) — detect-only.
// docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md section 8.2-8.3.
//
// Two things this job watches for, neither of which the Router (see
// collection.service.js) can resolve itself:
//
// 1. An attempt stuck in 'pending'/'ambiguous' past a threshold -- either
//    our own process crashed between opening the attempt and getting a
//    result (Phase A committed, Phase B/C never ran), or a real 'ambiguous'
//    outcome from a provider that nobody has resolved yet. Resolving it for
//    real requires asking the provider directly (same principle as
//    stale-pending-donations.job.js's GetLpResult call) -- not implemented
//    here, because neither real adapter can make that call yet (see
//    adapters/*.adapter.js). This job only ever surfaces the gap.
//
// 2. A Statement whose payments sum to more than its total_due -- should be
//    structurally impossible (the Router never opens a second attempt while
//    one is still active, and total_due is frozen once a Statement leaves
//    'draft'), checked anyway, same belt-and-suspenders policy as
//    billing-approval-consistency.job.js.
const { recordFinding } = require('./reconciliation-findings');

const STUCK_AFTER_HOURS = 2;

module.exports = {
  name: 'collection-attempt-reconciliation',
  schedule: '0 * * * *',
  timeoutMs: 2 * 60 * 1000,
  handler: async (db) => {
    const stuckRes = await db.query(
      `SELECT id, statement_id, status
       FROM collection_attempts
       WHERE status IN ('pending', 'ambiguous')
         AND initiated_at < NOW() - INTERVAL '${STUCK_AFTER_HOURS} hours'`
    );
    for (const row of stuckRes.rows) {
      await recordFinding(db, {
        jobName: 'collection-attempt-reconciliation',
        findingType: 'collection_attempt_stuck',
        severity: 'critical',
        subjectType: 'collection_attempt',
        subjectId: row.id,
        details: { statementId: row.statement_id, status: row.status },
      });
    }

    const overpaidRes = await db.query(
      `SELECT s.id
       FROM statements s
       JOIN (SELECT statement_id, SUM(amount) AS total FROM payments GROUP BY statement_id) p
         ON p.statement_id = s.id
       WHERE p.total > s.total_due`
    );
    for (const row of overpaidRes.rows) {
      await recordFinding(db, {
        jobName: 'collection-attempt-reconciliation',
        findingType: 'statement_payments_exceed_total_due',
        severity: 'critical',
        subjectType: 'statement',
        subjectId: row.id,
        details: {},
      });
    }

    const resolvedRes = await db.query(
      `UPDATE reconciliation_findings f
       SET resolved_at = NOW(), resolved_by = 'system'
       WHERE f.job_name = 'collection-attempt-reconciliation' AND f.resolved_at IS NULL
         AND (
           (f.finding_type = 'collection_attempt_stuck' AND NOT EXISTS (
             SELECT 1 FROM collection_attempts ca WHERE ca.id = f.subject_id AND ca.status IN ('pending', 'ambiguous')
           ))
           OR (f.finding_type = 'statement_payments_exceed_total_due' AND NOT EXISTS (
             SELECT 1 FROM statements s
             JOIN (SELECT statement_id, SUM(amount) AS total FROM payments GROUP BY statement_id) p ON p.statement_id = s.id
             WHERE s.id = f.subject_id AND p.total > s.total_due
           ))
         )`
    );

    return { stuckFound: stuckRes.rows.length, overpaidFound: overpaidRes.rows.length, autoResolved: resolvedRes.rowCount };
  },
};
