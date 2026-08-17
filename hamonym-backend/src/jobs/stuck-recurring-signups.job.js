// B6 — Stuck Recurring Signups (docs/CARDCOM_OPERATIONAL_PROCESSES.md,
// refined 2026-08-15 after the completeSignup deep-dive). The original B6
// design ("pending_creation stale past N hours") missed the worse
// sub-case: a crash *before* completeSignup's own first write leaves
// recurring_instructions.status at 'pending_payment' forever — it never
// even reaches 'pending_creation', so a status-only staleness check would
// never catch it. The real signal that something is wrong isn't "how long
// has this sat here" — it's "the donor's payment already succeeded, but
// Hamonym never finished the recurring signup for it".
//
// Detect/report ONLY — deliberately does not call createRecurring. Two
// reasons, not one: (1) it's genuinely unknown from here alone whether
// completeSignup's crash happened before or after the Cardcom Create call
// actually landed — recovering by calling createRecurring again risks
// creating a second, duplicate Recurring order at Cardcom for a donor who
// already has one. (2) there is no known Cardcom endpoint to list existing
// RecurringId's under an AccountId to check first (Create Research,
// 2026-08-11/15 — SOAP/REST v11/Name-to-Value docs all searched, none
// found) — so there is no deterministic way to verify "does one already
// exist" before deciding to create another. Until either of those is
// resolved, recovery here can only make things worse, never better.
const { recordFinding } = require('./reconciliation-findings');

module.exports = {
  name: 'stuck-recurring-signups',
  // Approved production schedule (Operational Policy, 2026-08-16): hourly,
  // automatic — raised from the original "daily until dedup exists" once
  // migration 052's dedup landed. A donor who paid for a recurring gift
  // that never actually started is judged important enough to not sit
  // undetected for a full day. Not wired to a scheduler yet.
  schedule: '0 * * * *',
  timeoutMs: 2 * 60 * 1000,
  handler: async (db) => {
    const res = await db.query(
      `SELECT ri.id, ri.entity_id, ri.campaign_id, ri.status, ri.donor_email,
              ri.updated_at, d.id AS donation_id, d.completed_at AS donation_completed_at
       FROM recurring_instructions ri
       JOIN donations d ON d.recurring_instruction_id = ri.id
       WHERE ri.status IN ('pending_payment', 'pending_creation')
         AND d.status = 'paid'
       ORDER BY ri.updated_at ASC
       LIMIT 50`
    );

    let stuckFindings = 0;
    for (const row of res.rows) {
      stuckFindings++;
      await recordFinding(db, {
        jobName: 'stuck-recurring-signups',
        findingType: 'stuck_recurring_signup',
        severity: 'critical',
        subjectType: 'recurring_instruction',
        subjectId: row.id,
        details: {
          status: row.status,
          donorEmail: row.donor_email,
          instructionUpdatedAt: row.updated_at,
          paidDonationId: row.donation_id,
          donationCompletedAt: row.donation_completed_at,
        },
      });
    }

    // Auto-resolve: rechecks each currently-open finding's OWN instruction
    // (by subject_id) against the live condition — not "missing from this
    // run's LIMIT 50 result", which would be wrong if more than 50
    // instructions were stuck at once. Resolves once the instruction moves
    // out of pending_payment/pending_creation (activated, failed, etc.).
    const resolvedRes = await db.query(
      `UPDATE reconciliation_findings f
       SET resolved_at = NOW(), resolved_by = 'system'
       WHERE f.job_name = 'stuck-recurring-signups' AND f.finding_type = 'stuck_recurring_signup'
         AND f.resolved_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM recurring_instructions ri
           JOIN donations d ON d.recurring_instruction_id = ri.id AND d.status = 'paid'
           WHERE ri.id = f.subject_id AND ri.status IN ('pending_payment', 'pending_creation')
         )`
    );

    return { checked: res.rows.length, stuckFindings, autoResolved: resolvedRes.rowCount };
  },
};
