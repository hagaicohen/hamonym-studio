// FIN-11 Stage 4 — confirmed-failure retry sweep (2026-10).
// docs/finance/FIN11_STAGE4_TECHNICAL_DESIGN.md has the full design.
//
// NOT REGISTERED for production scheduling (simulation registration has schedule=null) in src/jobs/index.js -- see fin11-card-collection.job.js's
// header for why, and the same activation warning applies here (this job
// also calls the real card adapter's charge()).
//
// Why this job exists, distinct from fin11-card-collection.job.js: that
// job's own retry loop only covers CONFIRMED failures discovered within
// its own single run (CardCom's charge() is synchronous, so most declines
// are known immediately). But a charge() call can also come back
// 'ambiguous' (a dropped connection, not a decline) -- collection-attempt-
// reconciliation.job.js (existing, unmodified, already live) resolves
// those later, on its own hourly schedule, into a real terminal outcome.
// If THAT later resolution turns out to be a confirmed failure, the
// business-approved "up to 3 attempts total" policy still applies -- this
// sweep is what gives that statement its remaining attempt(s), without
// which a Statement whose first attempt happened to be ambiguous-then-
// declined would silently get fewer retries than one that was declined
// outright on the 28th. "Remaining" (plural) because collectWithRetries
// retries immediately up to whatever budget is actually left (no minimum
// spacing between attempts is part of the approved policy, only the
// 3-total cap) -- a statement with 1 existing attempt that keeps getting
// confirmed failures here will go straight to exhaustion in ONE sweep
// call, not one extra attempt per sweep run. Offset 15 minutes after
// collection-attempt-reconciliation's own :00 tick so a freshly-confirmed
// decline has already landed by the time this runs.
//
// Deliberately reuses collectWithRetries/openFin11CappedCardAttempt
// unchanged -- every guard (hold, exported-MASAV, active-attempt, the
// 3-attempt cap itself) is re-checked against real DB state inside that
// function, not assumed here. This file's only job is to find CANDIDATE
// statement ids cheaply; it invents no new safety logic.
const { ACTIONABLE_STATEMENT_STATUSES } = require('../modules/collection-engine/collection.service');
const {
  collectWithRetries,
  MAX_CARD_ATTEMPTS,
  CONFIRMED_FAILURE_STATUSES,
} = require('../modules/billing-engine/fin11-card-collection.service');
const defaultGetAdapter = require('../modules/collection-engine/adapters/get-adapter');
const { recordFinding } = require('./reconciliation-findings');

async function findRetryCandidates(db, entityIds = null, fingerprint = null) {
  const res = await db.query(
    `SELECT s.id
     FROM statements s
     WHERE s.status = ANY($1::text[])
       AND ($4::uuid[] IS NULL OR s.billing_account_id IN (SELECT id FROM billing_accounts WHERE entity_id = ANY($4::uuid[])))
       AND ($5::text IS NULL OR s.billing_run_id IN (SELECT id FROM billing_runs WHERE result_summary->>'simulation_provider'='fin11_mock' AND result_summary->>'simulation_identity'=$5))
       AND EXISTS (
         SELECT 1 FROM collection_attempts ca
         WHERE ca.statement_id = s.id
           AND ca.collection_method = 'card'
           AND ca.attempt_number = (
             SELECT MAX(attempt_number) FROM collection_attempts
             WHERE statement_id = s.id AND collection_method = 'card'
           )
           AND ca.status = ANY($2::text[])
       )
       AND (
         SELECT COUNT(*) FROM collection_attempts
         WHERE statement_id = s.id AND collection_method = 'card'
       ) < $3`,
    [ACTIONABLE_STATEMENT_STATUSES, CONFIRMED_FAILURE_STATUSES, MAX_CARD_ATTEMPTS, entityIds, fingerprint]
  );
  return res.rows.map((r) => r.id);
}

async function handler(db, { now = new Date(), resolveAdapter = defaultGetAdapter, simulation } = {}) {
  const candidateIds = await findRetryCandidates(db, simulation?.entityIds || null, simulation?.fingerprint || null);

  const summary = { candidatesFound: candidateIds.length, succeeded: 0, confirmedFailureExhausted: 0, retryNotYetDue: 0, skippedOther: 0, errors: 0 };

  if (simulation) summary.skippedReasons = {};

  for (const statementId of candidateIds) {
    try {
      const cycles = await collectWithRetries(statementId, resolveAdapter, now);
      const last = cycles[cycles.length - 1];
      if (last?.resolved?.outcome === 'succeeded') summary.succeeded++;
      else if (last?.reason === 'max_attempts_reached') summary.confirmedFailureExhausted++;
      else if (last?.reason === 'retry_not_yet_due') summary.retryNotYetDue++;
      else summary.skippedOther++;
      if (simulation && last?.reason) summary.skippedReasons[last.reason] = (summary.skippedReasons[last.reason] || 0) + 1;
    } catch (err) {
      summary.errors++;
      await recordFinding(db, {
        jobName: 'fin11-card-retry-sweep',
        findingType: 'fin11_card_retry_sweep_statement_error',
        severity: 'critical',
        subjectType: 'statement',
        subjectId: statementId,
        details: { error: err.message },
      });
    }
  }

  return summary;
}

module.exports = {
  name: 'fin11-card-retry-sweep',
  schedule: '15 * * * *',
  timeoutMs: 5 * 60 * 1000,
  handler,
  findRetryCandidates, // exported for tests
};
