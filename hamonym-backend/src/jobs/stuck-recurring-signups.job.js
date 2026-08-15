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
module.exports = {
  name: 'stuck-recurring-signups',
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
      await db.query(
        `INSERT INTO reconciliation_findings (job_name, finding_type, severity, subject_type, subject_id, details)
         VALUES ('stuck-recurring-signups', 'stuck_recurring_signup', 'critical', 'recurring_instruction', $1, $2)`,
        [row.id, JSON.stringify({
          status: row.status,
          donorEmail: row.donor_email,
          instructionUpdatedAt: row.updated_at,
          paidDonationId: row.donation_id,
          donationCompletedAt: row.donation_completed_at,
        })]
      );
    }

    return { checked: res.rows.length, stuckFindings };
  },
};
