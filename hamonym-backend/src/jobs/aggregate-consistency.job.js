// B11 — Data Consistency / Aggregate Repair detection
// (docs/CARDCOM_OPERATIONAL_PROCESSES.md). No Cardcom call — donations is
// Hamonym's own source of truth for what campaigns.current_amount/
// supporters_count should be. Exists because current_amount is updated
// independently in 4 different code paths (markDonationPaid,
// detail-recurring.handler.js, createManualDonation, handleMockComplete),
// none of them transactional with the write before/after it — a crash
// between those writes drifts silently (see the audit in the operational
// doc). This is exactly the failure mode a real production incident
// already hit once (Phase 1 cleanup, 2026-08-14) and had to be fixed by
// hand; this job is the automated version of that same manual check.
//
// Detect-only — never writes to campaigns. Repair is a deliberate,
// separately-approved admin action (recompute from donations, not +/-).
module.exports = {
  name: 'aggregate-consistency',
  timeoutMs: 3 * 60 * 1000,
  handler: async (db) => {
    const totalRes = await db.query(`SELECT count(*) FROM campaigns WHERE deleted_at IS NULL`);
    const campaignsChecked = Number(totalRes.rows[0].count);

    const res = await db.query(
      `SELECT c.id, c.current_amount, c.supporters_count,
              COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'paid'), 0) AS actual_amount,
              COUNT(d.id) FILTER (WHERE d.status = 'paid') AS actual_supporters
       FROM campaigns c
       LEFT JOIN donations d ON d.campaign_id = c.id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id
       HAVING c.current_amount != COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'paid'), 0)
           OR c.supporters_count != COUNT(d.id) FILTER (WHERE d.status = 'paid')`
    );

    let mismatches = 0;
    for (const row of res.rows) {
      mismatches++;
      await db.query(
        `INSERT INTO reconciliation_findings (job_name, finding_type, severity, subject_type, subject_id, details)
         VALUES ('aggregate-consistency', 'campaign_aggregate_mismatch', 'critical', 'campaign', $1, $2)`,
        [row.id, JSON.stringify({
          currentAmount: row.current_amount, actualAmount: row.actual_amount,
          currentSupporters: row.supporters_count, actualSupporters: row.actual_supporters,
        })]
      );
    }

    return { campaignsChecked, mismatches };
  },
};
