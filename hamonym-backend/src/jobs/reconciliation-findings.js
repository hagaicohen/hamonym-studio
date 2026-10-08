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
// Returns the finding's row (`{ id, found_at, isNew }`) as of 2026-10-07 —
// previously it returned nothing. Purely additive: every pre-existing caller
// ignores the return value.
//
// WHY: the admin/ops notification slice needs a stable per-incident identity
// to key an email on (see admin-notification.service.js). The row id is
// exactly that, and it follows the dedup semantics above for free — while a
// finding is open, every re-detection (a job re-run, a redelivered webhook,
// a repeated health evaluation) upserts into the SAME row and therefore
// yields the SAME id and the SAME idempotency key, so no second email. A
// problem that recurs after being resolved gets a new row, a new id, and
// correctly a new email.
//
// `isNew` is derived from found_at = last_seen_at, both set by this statement:
// on a fresh INSERT they are equal, on the DO UPDATE path last_seen_at moves
// and found_at does not. Reported for callers that want to log/report it —
// notification idempotency deliberately does NOT depend on it (the
// email_logs unique index is the guarantee, not this flag).
async function recordFinding(db, { jobName, findingType, severity, subjectType, subjectId, details }) {
  const res = await db.query(
    `INSERT INTO reconciliation_findings (job_name, finding_type, severity, subject_type, subject_id, details, found_at, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
     ON CONFLICT (job_name, finding_type, subject_type, subject_id) WHERE resolved_at IS NULL
     DO UPDATE SET last_seen_at = NOW(), details = EXCLUDED.details, severity = EXCLUDED.severity
     RETURNING id, found_at, last_seen_at`,
    [jobName, findingType, severity, subjectType, subjectId, JSON.stringify(details ?? {})]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    found_at: row.found_at,
    isNew: new Date(row.found_at).getTime() === new Date(row.last_seen_at).getTime(),
  };
}
exports.recordFinding = recordFinding;
