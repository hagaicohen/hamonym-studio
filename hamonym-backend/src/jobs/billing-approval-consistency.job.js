// Billing Approval Consistency (2026-08-28) — detect-only safety net for
// the Approval Engine's invariants (approval.service.js). The Engine
// enforces these transactionally already; this job exists as the same
// belt-and-suspenders pattern already used elsewhere in this codebase
// (structural DB constraint + a periodic detect-only job), not because the
// invariant is expected to ever actually break.
//
// "Donation claimed by more than one effective financial fact" is not
// checked here — donations.effective_statement_id is a single column on a
// single row, so a donation referencing two different statements at once
// is not a business rule being followed, it's structurally impossible.
const { recordFinding } = require('./reconciliation-findings');

const EFFECTIVE_STATEMENT_STATUSES = ['approved', 'open', 'paid', 'cancelled', 'written_off'];

module.exports = {
  name: 'billing-approval-consistency',
  // Not wired to any scheduler yet, same as every other job in this file --
  // see docs/CARDCOM_OPERATIONAL_PROCESSES.md Part F. Hourly is a
  // reasonable starting cadence once it is wired: Approval is not a
  // high-frequency action, and every check here is a plain indexed query
  // over billing_engine's own (currently tiny) tables.
  schedule: '0 * * * *',
  timeoutMs: 2 * 60 * 1000,
  handler: async (db) => {
    let effectiveNotFullyClaimed = 0;
    let claimedByIneffective = 0;
    let claimedButMissingFromComponents = 0;
    let grossMismatch = 0;

    // 1. An effective Statement whose components are not ALL claimed by it.
    const notFullyClaimed = await db.query(
      `SELECT DISTINCT s.id
       FROM statements s
       JOIN statement_components sc ON sc.statement_id = s.id
       LEFT JOIN donations d ON d.id = sc.donation_id
       WHERE s.status = ANY($1::text[])
         AND (d.effective_statement_id IS NULL OR d.effective_statement_id != s.id)`,
      [EFFECTIVE_STATEMENT_STATUSES]
    );
    for (const row of notFullyClaimed.rows) {
      await recordFinding(db, {
        jobName: 'billing-approval-consistency', findingType: 'statement_components_not_fully_claimed',
        severity: 'critical', subjectType: 'statement', subjectId: row.id, details: {},
      });
      effectiveNotFullyClaimed++;
    }

    // 2. A donation claimed by a Statement that is NOT financially effective
    // (should be impossible -- only approveStatement ever sets this column,
    // and only alongside the draft->approved transition in the same
    // transaction -- but checked directly rather than assumed).
    const claimedByBad = await db.query(
      `SELECT d.id AS donation_id, d.effective_statement_id, s.status
       FROM donations d
       JOIN statements s ON s.id = d.effective_statement_id
       WHERE d.effective_statement_id IS NOT NULL
         AND NOT (s.status = ANY($1::text[]))`,
      [EFFECTIVE_STATEMENT_STATUSES]
    );
    for (const row of claimedByBad.rows) {
      await recordFinding(db, {
        jobName: 'billing-approval-consistency', findingType: 'donation_claimed_by_ineffective_statement',
        severity: 'critical', subjectType: 'donation', subjectId: row.donation_id,
        details: { effectiveStatementId: row.effective_statement_id, statementStatus: row.status },
      });
      claimedByIneffective++;
    }

    // 3. A donation claimed by a statement it doesn't actually appear under
    // in statement_components (would mean the claim and the calculation
    // history disagree about what was actually billed).
    const orphanClaims = await db.query(
      `SELECT d.id AS donation_id, d.effective_statement_id
       FROM donations d
       WHERE d.effective_statement_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM statement_components sc
           WHERE sc.statement_id = d.effective_statement_id AND sc.donation_id = d.id
         )`
    );
    for (const row of orphanClaims.rows) {
      await recordFinding(db, {
        jobName: 'billing-approval-consistency', findingType: 'claimed_donation_missing_from_components',
        severity: 'critical', subjectType: 'donation', subjectId: row.donation_id,
        details: { effectiveStatementId: row.effective_statement_id },
      });
      claimedButMissingFromComponents++;
    }

    // 4. A Statement's own gross_raised drifting from what its components
    // actually sum to (should be impossible post-approval, since both are
    // frozen together -- checked regardless of status, since a draft in
    // this state would also mean a Calculation Service bug).
    const grossMismatchRows = await db.query(
      `SELECT s.id
       FROM statements s
       JOIN (SELECT statement_id, SUM(amount_snapshot) AS sum_snap FROM statement_components GROUP BY statement_id) c
         ON c.statement_id = s.id
       WHERE s.gross_raised != c.sum_snap`
    );
    for (const row of grossMismatchRows.rows) {
      await recordFinding(db, {
        jobName: 'billing-approval-consistency', findingType: 'statement_gross_raised_mismatch',
        severity: 'critical', subjectType: 'statement', subjectId: row.id, details: {},
      });
      grossMismatch++;
    }

    // Auto-resolve: same policy as the other jobs -- a finding closes the
    // moment its own subject no longer reproduces the condition, checked
    // directly per subject, not "missing from this run's result set".
    const resolvedRes = await db.query(
      `UPDATE reconciliation_findings f
       SET resolved_at = NOW(), resolved_by = 'system'
       WHERE f.job_name = 'billing-approval-consistency' AND f.resolved_at IS NULL
         AND (
           (f.finding_type = 'statement_components_not_fully_claimed' AND NOT EXISTS (
             SELECT 1 FROM statement_components sc LEFT JOIN donations d ON d.id = sc.donation_id
             WHERE sc.statement_id = f.subject_id AND (d.effective_statement_id IS NULL OR d.effective_statement_id != f.subject_id)
           ))
           OR (f.finding_type = 'donation_claimed_by_ineffective_statement' AND NOT EXISTS (
             SELECT 1 FROM donations d JOIN statements s ON s.id = d.effective_statement_id
             WHERE d.id = f.subject_id AND NOT (s.status = ANY($1::text[]))
           ))
           OR (f.finding_type = 'claimed_donation_missing_from_components' AND NOT EXISTS (
             SELECT 1 FROM donations d WHERE d.id = f.subject_id AND d.effective_statement_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM statement_components sc WHERE sc.statement_id = d.effective_statement_id AND sc.donation_id = d.id)
           ))
           OR (f.finding_type = 'statement_gross_raised_mismatch' AND NOT EXISTS (
             SELECT 1 FROM statements s
             JOIN (SELECT statement_id, SUM(amount_snapshot) AS sum_snap FROM statement_components GROUP BY statement_id) c ON c.statement_id = s.id
             WHERE s.id = f.subject_id AND s.gross_raised != c.sum_snap
           ))
         )`,
      [EFFECTIVE_STATEMENT_STATUSES]
    );

    return {
      effectiveNotFullyClaimed, claimedByIneffective, claimedButMissingFromComponents, grossMismatch,
      autoResolved: resolvedRes.rowCount,
    };
  },
};
