// Billing Provisioning Gap (2026-08-28) — detect-only safety net for the
// exact silent failure mode flagged during the entity_billing/billing_accounts
// audit: Calculation Service only ever looks at `billing_accounts WHERE
// enforcement_status = 'active'` (calculation.service.js), so an approved,
// donation-accepting entity that nobody has explicitly provisioned a billing
// account for is simply invisible to Billing -- not skipped-and-logged, not
// present in any billing_run's result_summary, just absent. Provisioning is
// deliberately a manual Super Admin action (see
// src/modules/platform/billing-provisioning/) with no auto-create anywhere,
// so this job is the only thing that would ever surface the gap.
const { recordFinding } = require('./reconciliation-findings');

module.exports = {
  name: 'billing-provisioning-gap',
  // FROZEN 2026-09-10 (Billing v1 simplicity decision) -- schedule set to
  // null so cron-entry.js's loop skips it (`if (!job?.schedule) continue`),
  // while staying registered and runnable on demand via the Admin "Run now"
  // action. Confirmed safe to freeze: this job only ever writes to
  // reconciliation_findings (recordFinding), never to any money-moving
  // table. The gap it watches for is also now surfaced directly to the
  // operator by billing-monthly-cycle.job.js's own blocked-entity list on
  // every real calculation run, so this hourly duplicate scan is not the
  // only signal anymore either. Re-enable by restoring a real cron
  // expression here if that changes.
  schedule: null,
  timeoutMs: 2 * 60 * 1000,
  handler: async (db) => {
    const gapRows = await db.query(
      `SELECT e.id AS entity_id, e.display_name,
              COUNT(d.id)::int AS paid_donation_count,
              SUM(d.amount) AS paid_gross_total
       FROM entities e
       JOIN donations d ON d.entity_id = e.id AND d.status = 'paid' AND d.is_mock = false
       WHERE e.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM billing_accounts ba WHERE ba.entity_id = e.id)
       GROUP BY e.id, e.display_name`
    );

    for (const row of gapRows.rows) {
      await recordFinding(db, {
        jobName: 'billing-provisioning-gap',
        findingType: 'active_entity_missing_billing_account',
        severity: 'critical',
        subjectType: 'entity',
        subjectId: row.entity_id,
        details: {
          displayName: row.display_name,
          paidDonationCount: row.paid_donation_count,
          paidGrossTotal: row.paid_gross_total,
        },
      });
    }

    // Auto-resolve the moment a billing_account exists for the entity --
    // provisioning is the fix, regardless of what enforcement_status it's
    // given (even 'suspended' is a deliberate, visible decision, unlike
    // never having a row at all).
    const resolvedRes = await db.query(
      `UPDATE reconciliation_findings f
       SET resolved_at = NOW(), resolved_by = 'system'
       WHERE f.job_name = 'billing-provisioning-gap'
         AND f.finding_type = 'active_entity_missing_billing_account'
         AND f.resolved_at IS NULL
         AND EXISTS (SELECT 1 FROM billing_accounts ba WHERE ba.entity_id = f.subject_id)`
    );

    return {
      gapsFound: gapRows.rows.length,
      autoResolved: resolvedRes.rowCount,
    };
  },
};
