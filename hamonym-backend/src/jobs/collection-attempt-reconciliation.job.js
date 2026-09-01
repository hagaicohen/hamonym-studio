// Collection Attempt Reconciliation (2026-08-28, extended 2026-08-30) —
// detect-only became detect-AND-resolve now that the CardCom adapter's
// reconcile() exists and has been live-verified against the real API
// (2026-08-30, see docs/BILLING_ENGINE_SESSION_HANDOFF_2026-08-28.md).
// docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md sections 6.5/8.2-8.3.
//
// What this job does now, in order:
//
// 1. For every candidate attempt -- 'ambiguous' (no age filter: an
//    ambiguous outcome is already a completed, if inconclusive, answer
//    from the charge call itself, so there's no "might still be
//    legitimately in flight" concern, unlike 'pending' below) or 'pending'
//    stuck past STUCK_AFTER_HOURS (unchanged from the original detect-only
//    version of this job -- 'pending' COULD still be a genuinely in-flight
//    charge() call, so this margin exists specifically to avoid racing it,
//    not as a retry/write-off business policy) -- ask the provider
//    directly via the adapter's reconcile(), using the SAME attemptId
//    (== the ExternalUniqTranId originally submitted), never a new one.
//      - succeeded/declined/technical_failure -> resolveAttempt() finalizes
//        it, the exact same function and outcome shape the live Router
//        itself uses after a fresh charge() call -- no parallel finalization
//        path was invented for this job.
//      - not_found -> does NOT mean declined or safe to recharge (see
//        adapter.contract.js) -- left completely untouched, re-checked on
//        a future run. This job never calls charge() for anything.
//      - the lookup call itself failing -> left untouched, recorded as a
//        finding for visibility only.
// 2. Structural belt-and-suspenders check, unchanged: a Statement whose
//    payments sum exceeds its total_due -- should be structurally
//    impossible by construction, checked anyway.
//
// Concurrency: resolveAttempt() is the same function the live Router calls.
// If this job and a live in-flight charge both try to finalize the same
// real provider transaction, the payments(provider, provider_reference)
// UNIQUE constraint lets exactly one INSERT succeed; the loser's whole
// transaction rolls back (Postgres error code 23505), caught below as an
// expected, harmless race outcome -- not a failure, not double-counted
// money. See scripts/test-collection-attempt-recovery.js.
const { recordFinding } = require('./reconciliation-findings');
const defaultCardAdapter = require('../modules/collection-engine/adapters/cardcom-token-charge.adapter');
const { resolveAttempt: defaultResolveAttempt } = require('../modules/collection-engine/collection.service');

const STUCK_AFTER_HOURS = 2;
const UNIQUE_VIOLATION = '23505';

function defaultGetAdapter(collectionMethod) {
  // Only 'card' can reconcile anything today -- masav has no adapter
  // implementation at all yet (NOT_IMPLEMENTED, see adapters/masav.adapter.js).
  return collectionMethod === 'card' ? defaultCardAdapter : null;
}

// Core logic, dependency-injectable for testing (same seam style as
// collection.service.js's runCollectionForStatement/resolveAdapter) --
// getAdapter/resolveAttemptFn default to the real implementations in
// production; tests inject fakes so this can be exercised without a real
// DB or a real CardCom call, and without ever creating a real payments row
// (which cannot be deleted afterward -- see migration 059's append-only
// trigger -- making real-DB testing of the success path unsafe).
async function reconcileStuckAttempts(db, { getAdapter = defaultGetAdapter, resolveAttemptFn = defaultResolveAttempt } = {}) {
  const candidatesRes = await db.query(
    `SELECT id, statement_id, status, collection_method
     FROM collection_attempts
     WHERE status = 'ambiguous'
        OR (status = 'pending' AND initiated_at < NOW() - INTERVAL '${STUCK_AFTER_HOURS} hours')
     ORDER BY initiated_at ASC
     LIMIT 50`
  );

  let reconciled = 0;
  let stillUnresolved = 0;
  let lookupFailed = 0;
  let raceLost = 0;
  const stuckForFinding = [];

  for (const row of candidatesRes.rows) {
    const adapter = getAdapter(row.collection_method);
    if (!adapter || typeof adapter.reconcile !== 'function') {
      stuckForFinding.push(row);
      continue;
    }

    let outcome;
    try {
      outcome = await adapter.reconcile({ attemptId: row.id });
    } catch (err) {
      lookupFailed++;
      stuckForFinding.push(row);
      continue;
    }

    if (outcome.outcome === 'not_found') {
      // Preserve ambiguity -- never treated as declined or as license to
      // charge again.
      stillUnresolved++;
      stuckForFinding.push(row);
      continue;
    }

    try {
      await resolveAttemptFn(row.id, row.statement_id, outcome);
      reconciled++;
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        // Someone else (the live Router, or another reconciliation run)
        // already finalized this exact provider transaction first -- the
        // DB constraint is what actually guarantees "exactly one Payment",
        // this is its expected losing side, not an error.
        raceLost++;
        continue;
      }
      throw err;
    }
  }

  for (const row of stuckForFinding) {
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

  return {
    checked: candidatesRes.rows.length,
    reconciled,
    stillUnresolved,
    lookupFailed,
    raceLost,
    stuckFound: stuckForFinding.length,
    overpaidFound: overpaidRes.rows.length,
    autoResolved: resolvedRes.rowCount,
  };
}

module.exports = {
  name: 'collection-attempt-reconciliation',
  schedule: '0 * * * *',
  timeoutMs: 2 * 60 * 1000,
  handler: (db) => reconcileStuckAttempts(db),
  reconcileStuckAttempts, // exported for scripts/test-collection-attempt-recovery.js
};
