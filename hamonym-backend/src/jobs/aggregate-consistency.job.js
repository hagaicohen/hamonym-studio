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
//
// Approved production schedule (Operational Policy, 2026-08-16): daily,
// automatic. Cheapest of the four jobs (no Cardcom call, one query), but
// the failure mode it catches is display-only drift, not money at risk —
// daily is proportionate. See reconciliation-findings.js for the dedup
// upsert (recordFinding) this job uses instead of a raw INSERT.
const { recordFinding } = require('./reconciliation-findings');

module.exports = {
  name: 'aggregate-consistency',
  schedule: '0 3 * * *', // daily at 03:00 — not wired to a scheduler yet
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
      await recordFinding(db, {
        jobName: 'aggregate-consistency',
        findingType: 'campaign_aggregate_mismatch',
        severity: 'critical',
        subjectType: 'campaign',
        subjectId: row.id,
        details: {
          currentAmount: row.current_amount, actualAmount: row.actual_amount,
          currentSupporters: row.supporters_count, actualSupporters: row.actual_supporters,
        },
      });
    }

    // Auto-resolve: re-checks each currently-open finding's OWN campaign
    // against the live mismatch condition (not "missing from this run's
    // result set") — this scan has no LIMIT so the two are equivalent here,
    // but written this way for the same reason as the other two jobs (see
    // their comments): correctness shouldn't depend on the detection query
    // staying unbounded forever.
    const resolvedRes = await db.query(
      `UPDATE reconciliation_findings f
       SET resolved_at = NOW(), resolved_by = 'system'
       WHERE f.job_name = 'aggregate-consistency' AND f.finding_type = 'campaign_aggregate_mismatch'
         AND f.resolved_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM campaigns c
           LEFT JOIN donations d ON d.campaign_id = c.id AND d.status = 'paid'
           WHERE c.id = f.subject_id AND c.deleted_at IS NULL
           GROUP BY c.id, c.current_amount, c.supporters_count
           HAVING c.current_amount != COALESCE(SUM(d.amount), 0)
               OR c.supporters_count != COUNT(d.id)
         )`
    );

    return { campaignsChecked, mismatches, autoResolved: resolvedRes.rowCount };
  },
};
