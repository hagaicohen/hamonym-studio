// FIN-11 Stage 4 — automated capped card collection (2026-10).
// docs/finance/FIN11_STAGE4_TECHNICAL_DESIGN.md has the full design.
//
// NOT REGISTERED in src/jobs/index.js -- this file exists and is fully
// testable (via job-runner.run('fin11-card-collection') or by calling
// `handler` directly), but the scheduler (src/jobs/scheduler.js) only ever
// wires jobs that index.js registers. Adding the registration line is a
// separate, explicitly-reviewed step -- same precedent as every job in
// this directory when first written (see job-runner.js's own header).
// Activating this job means it WILL call the real, live CardCom adapter
// (cardcom-token-charge.adapter.js -- NOT_IMPLEMENTED=false, charge() is
// a real implementation) and WILL move real money the next time day 28
// comes around. Do not add the registration line without separate,
// explicit approval for real financial activation.
//
// Timezone correctness: reuses computeMostRecentCycleBoundary verbatim
// from billing-monthly-cycle.job.js -- the SAME "which cycle just closed"
// decision the Statement itself was created against, including its
// DST-correct Asia/Jerusalem cutoff math (billing-period.util.js) and its
// proven fix for the cron matcher's own UTC-only limitation (hourly tick
// on UTC day 28, real decision made in business logic, never in the cron
// expression). No new timezone math is introduced here.
//
// Idempotency / "missed runs cannot cause duplicate charges": every
// decision point (which Statements are actionable, whether an attempt is
// already active, whether the latest attempt was a confirmed failure, the
// 3-attempt cap) is read fresh from the DB on every call, inside
// fin11-card-collection.service.js's own locked transaction -- not a
// local counter or a "have I already run today" flag. Running this
// handler any number of times for the same cycle (a missed day fixed by a
// later manual "Run now", two overlapping ticks, a retry sweep calling
// into the same Statements later) converges on the same safe outcome:
// already-paid or already-exhausted Statements are skipped, nothing is
// charged twice. job-runner.js's advisory lock additionally serializes
// concurrent *invocations* of this specific job name, on top of that.
const { ACTIONABLE_STATEMENT_STATUSES } = require('../modules/collection-engine/collection.service');
const { collectWithRetries } = require('../modules/billing-engine/fin11-card-collection.service');
const { computeMostRecentCycleBoundary } = require('./billing-monthly-cycle.job');
const defaultGetAdapter = require('../modules/collection-engine/adapters/get-adapter');
const { recordFinding } = require('./reconciliation-findings');

async function handler(db, { now = new Date(), resolveAdapter = defaultGetAdapter } = {}) {
  const { periodEnd } = await computeMostRecentCycleBoundary(db, now);

  const periodRes = await db.query(
    `SELECT id FROM billing_periods WHERE period_end = $1 AND retired = false`,
    [periodEnd]
  );
  if (!periodRes.rows[0]) {
    // The billing cutoff for this cycle hasn't been calculated yet
    // (billing-monthly-cycle.job.js runs first) -- nothing to collect
    // against. Not an error: a harmless no-op, identical in spirit to
    // that job's own 'already_calculated' no-op shape.
    return { reason: 'period_not_found', periodEnd: periodEnd.toISOString(), statementsConsidered: 0 };
  }
  const periodId = periodRes.rows[0].id;

  const statementsRes = await db.query(
    `SELECT id FROM statements WHERE billing_period_id = $1 AND status = ANY($2::text[])`,
    [periodId, ACTIONABLE_STATEMENT_STATUSES]
  );

  const summary = {
    periodId,
    periodEnd: periodEnd.toISOString(),
    statementsConsidered: statementsRes.rows.length,
    succeeded: 0,
    confirmedFailureExhausted: 0,
    collectionHeld: 0,
    maskedByMasavExport: 0,
    skippedOther: 0,
    errors: 0,
  };

  for (const row of statementsRes.rows) {
    try {
      const cycles = await collectWithRetries(row.id, resolveAdapter);
      const last = cycles[cycles.length - 1];
      if (last?.resolved?.outcome === 'succeeded') summary.succeeded++;
      else if (last?.reason === 'max_attempts_reached') summary.confirmedFailureExhausted++;
      else if (last?.reason === 'entity_collection_held') summary.collectionHeld++;
      else if (last?.reason === 'masav_proposal_exported_unresolved') summary.maskedByMasavExport++;
      else summary.skippedOther++;
    } catch (err) {
      summary.errors++;
      await recordFinding(db, {
        jobName: 'fin11-card-collection',
        findingType: 'fin11_card_collection_statement_error',
        severity: 'critical',
        subjectType: 'statement',
        subjectId: row.id,
        details: { error: err.message },
      });
    }
  }

  return summary;
}

module.exports = {
  name: 'fin11-card-collection',
  // Hourly on UTC day 28, same proven shape as billing-monthly-cycle.job.js
  // -- the real Israel-time cutoff decision is made inside
  // computeMostRecentCycleBoundary, never by this cron expression.
  schedule: '0 * 28 * *',
  timeoutMs: 5 * 60 * 1000,
  handler,
};
