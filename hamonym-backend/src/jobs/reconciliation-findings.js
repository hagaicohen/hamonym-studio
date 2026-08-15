// Dedup semantics for reconciliation_findings (docs/CARDCOM_OPERATIONAL_PROCESSES.md,
// Operational Policy 2026-08-16). "Open" = resolved_at IS NULL. At most one
// open finding per (job_name, finding_type, subject_type, subject_id) —
// enforced by a partial unique index (migration 052), not just this
// function, so two job runs racing each other can never both INSERT.
//
// Recurrence policy (explicit product decision): if a finding is resolved
// and the same problem comes back later, it gets a NEW row, not a reopened
// one — see migration 052's comment for why. This function only ever
// upserts against currently-open rows; a resolved row never blocks a fresh
// INSERT, by construction of the partial index it targets.
async function recordFinding(db, { jobName, findingType, severity, subjectType, subjectId, details }) {
  await db.query(
    `INSERT INTO reconciliation_findings (job_name, finding_type, severity, subject_type, subject_id, details, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (job_name, finding_type, subject_type, subject_id) WHERE resolved_at IS NULL
     DO UPDATE SET last_seen_at = NOW(), details = EXCLUDED.details, severity = EXCLUDED.severity`,
    [jobName, findingType, severity, subjectType, subjectId, JSON.stringify(details ?? {})]
  );
}
exports.recordFinding = recordFinding;
