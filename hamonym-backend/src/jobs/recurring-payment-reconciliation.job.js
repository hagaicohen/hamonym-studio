// Recurring Payment Reconciliation (2026-08-31, Donation Engine closure
// WP2) — closes the audit finding that a DetailRecurring webhook loss is
// currently unrecoverable: CardCom can successfully charge a recurring
// instruction's token every month, but if that webhook never arrives (or
// arrives and is lost before processing), nothing in this codebase would
// ever know. See docs/BILLING_ENGINE_SESSION_HANDOFF... [Donation Engine
// audit section] for the full finding.
//
// Verified against the official CardCom v11 swagger (not guessed):
// GetRecurringPaymentHistory is queried by AccountId (recurring_
// instructions.cardcom_account_id — a DIFFERENT field than RecurringId,
// both appear separately on the response items too) + a FromDate/ToDate
// window, and returns TranzactionId/RowID/PaymentNum/CreateDate/
// SumToBill/Status per actual billing attempt — independent of whether a
// webhook was ever delivered for it.
//
// LOOKBACK_WINDOW_DAYS is deliberately generous (well over one billing
// cycle) rather than a persisted checkpoint: safe to rerun over an
// overlapping window every time (idempotent, see below), so a missed
// scheduler execution — or ten — never creates a permanent hole the way a
// checkpoint-based "only look since last success" design would if the
// checkpoint itself never advances.
//
// Correlation problem, addressed honestly rather than assumed away:
// GetRecurringPaymentHistory does NOT return Cardcom's InternalDealNumber
// (what the live DetailRecurring webhook stores as donations.
// provider_reference — see detail-recurring.handler.js), and empirically
// (checked against this project's real production data, 2026-08-31) NONE
// of the real webhook-created recurring donations have donations.
// provider_row_id populated either, even though RowID is documented and
// does appear in at least one captured raw payload — so RowID cannot be
// assumed to reliably tie a reconciliation-sourced record back to a
// webhook-sourced one. There is no single shared identifier confirmed
// present on both sides. Given that, "already represented locally" is
// decided by the STRONGEST available signal instead of an assumed one:
//   1. If both sides happen to have provider_row_id, match on that first.
//   2. Otherwise, an existing 'paid' donation on the same recurring
//      instruction, same calendar day, same amount is treated as the same
//      charge. Deliberately checks 'paid' donations only, not 'failed'
//      ones — a failed attempt followed by a real successful retry is a
//      DIFFERENT charge that must still be recovered.
// This is not a cryptographic guarantee, but it is the best available
// correlation given what both Cardcom APIs actually expose, and every
// recovery this job performs is also written to reconciliation_findings
// (severity 'warning', not 'critical' — it succeeded in recovering money
// that was otherwise invisible, this is a visibility record, not an open
// problem) so nothing it does is silent.
//
// Explicitly NOT in scope: backfilling non-SUCCESSFUL history entries as
// 'failed' donations. Cardcom's recurring status vocabulary includes
// values (PENDINGFORPROCESSING, ONHOLD, DEBTAUTOBILLING) that are not
// necessarily final outcomes — treating them as 'failed' would be exactly
// the kind of guess this project has consistently refused to make for
// ambiguous provider states elsewhere (see the Collection Engine's
// 'ambiguous' outcome). Only a definitive 'SUCCESSFUL' entry with no local
// counterpart is acted on.
//
// `db` is threaded through as a parameter throughout (the job-runner's own
// convention, `handler: async (db) => ...`) rather than imported at module
// scope, specifically so this is testable with a fake db/mocked
// dependencies (scripts/test-recurring-payment-reconciliation.js) without
// ever needing a real 'paid' donation row — which, once created, cannot be
// deleted (migration 055's immutability trigger), making real-DB testing of
// the "already represented" match unsafe.
const defaultCardcomClient = require('../modules/payment/cardcom/cardcom.client');
const { recordFinding } = require('./reconciliation-findings');

const LOOKBACK_WINDOW_DAYS = 40;

function toDDMMYYYY(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

// item.CreateDate is an ISO date-time string per the official schema
// (format: date-time) -- take just the calendar date for the day-level
// match described above.
function historyItemDateOnly(item) {
  if (!item.CreateDate) return null;
  const d = new Date(item.CreateDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function alreadyRepresented(db, instructionId, item) {
  if (item.RowID != null) {
    const byRowId = await db.query(
      `SELECT id FROM donations WHERE recurring_instruction_id = $1 AND provider_row_id = $2`,
      [instructionId, String(item.RowID)]
    );
    if (byRowId.rows[0]) return true;
  }

  const chargeDate = historyItemDateOnly(item);
  if (chargeDate != null && item.SumToBill != null) {
    const byDayAmount = await db.query(
      `SELECT id FROM donations
       WHERE recurring_instruction_id = $1 AND status = 'paid'
         AND DATE(completed_at) = $2::date AND amount = $3`,
      [instructionId, chargeDate, item.SumToBill]
    );
    if (byDayAmount.rows[0]) return true;
  }

  return false;
}

async function reconcileInstruction(db, instruction, { getHistory, resolveCredentials, finalizeCharge }) {
  const credentials = await resolveCredentials(instruction.entity_id);
  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let response;
  try {
    response = await getHistory({
      apiName: credentials.apiName,
      apiPassword: credentials.apiPassword,
      accountId: instruction.cardcom_account_id,
      fromDate: toDDMMYYYY(from),
      toDate: toDDMMYYYY(now),
    });
  } catch (err) {
    await recordFinding(db, {
      jobName: 'recurring-payment-reconciliation',
      findingType: 'history_lookup_failed',
      severity: 'warning',
      subjectType: 'recurring_instruction',
      subjectId: instruction.id,
      details: { error: err.message },
    });
    return { checked: 0, recovered: 0 };
  }

  if (response?.ResponseCode !== 0) {
    await recordFinding(db, {
      jobName: 'recurring-payment-reconciliation',
      findingType: 'history_lookup_failed',
      severity: 'warning',
      subjectType: 'recurring_instruction',
      subjectId: instruction.id,
      details: { responseCode: response?.ResponseCode ?? null, description: response?.Description ?? null },
    });
    return { checked: 0, recovered: 0 };
  }

  const history = Array.isArray(response.RecurringPaymentHistory) ? response.RecurringPaymentHistory : [];
  // GetRecurringPaymentHistory is scoped by AccountId, which can carry more
  // than one RecurringId over its lifetime -- only entries for THIS
  // instruction's own RecurringId are relevant.
  const successfulItems = history.filter(
    (item) => item.RecurringId === instruction.cardcom_recurring_id && item.Status === 'SUCCESSFUL'
  );

  let recovered = 0;
  for (const item of successfulItems) {
    if (await alreadyRepresented(db, instruction.id, item)) continue;

    await finalizeCharge(instruction, {
      amount: item.SumToBill,
      providerReference: item.TranzactionId != null ? String(item.TranzactionId) : null,
      rowId: item.RowID != null ? String(item.RowID) : null,
      statusCode: item.ResposeCode != null ? String(item.ResposeCode) : null,
    });
    recovered++;

    await recordFinding(db, {
      jobName: 'recurring-payment-reconciliation',
      findingType: 'recurring_charge_recovered_from_history',
      severity: 'warning',
      subjectType: 'recurring_instruction',
      subjectId: instruction.id,
      details: {
        cardcomTranzactionId: item.TranzactionId ?? null,
        amount: item.SumToBill,
        chargeDate: historyItemDateOnly(item),
      },
    });
  }

  return { checked: successfulItems.length, recovered };
}

async function reconcileAllActiveInstructions(db, deps = {}) {
  const donationsService = require('../modules/donations/donations.service');
  const getHistory = deps.getHistory || defaultCardcomClient.getRecurringPaymentHistory;
  const resolveCredentials = deps.resolveCredentials || donationsService.resolveCardcomCredentialsForEntity;
  const finalizeCharge = deps.finalizeCharge || donationsService.finalizeSuccessfulRecurringCharge;

  const instructionsRes = await db.query(
    `SELECT id, entity_id, campaign_id, cardcom_account_id, cardcom_recurring_id
     FROM recurring_instructions
     WHERE status = 'active' AND cardcom_account_id IS NOT NULL AND cardcom_recurring_id IS NOT NULL`
  );

  let totalChecked = 0;
  let totalRecovered = 0;
  for (const instruction of instructionsRes.rows) {
    const { checked, recovered } = await reconcileInstruction(db, instruction, { getHistory, resolveCredentials, finalizeCharge });
    totalChecked += checked;
    totalRecovered += recovered;
  }

  return { instructionsChecked: instructionsRes.rows.length, successfulChargesChecked: totalChecked, recovered: totalRecovered };
}

// POST-LAUNCH HARDENING: recurring reconciliation exists but automatic
// scheduling is intentionally disabled pending validation of authoritative
// CardCom correlation, especially any fallback based on date+amount. See
// alreadyRepresented() above -- until a stronger confirmed identifier (e.g.
// provider_reference/TranzactionId matching) is validated, this job must
// only be run manually (job-runner.run('recurring-payment-reconciliation'))
// or via the Admin "Run now" action, never on an automatic cron tick. Do
// not re-add a `schedule` field here without that validation.
module.exports = {
  name: 'recurring-payment-reconciliation',
  timeoutMs: 5 * 60 * 1000,
  handler: (db) => reconcileAllActiveInstructions(db),
  // exported for scripts/test-recurring-payment-reconciliation.js
  reconcileAllActiveInstructions,
  reconcileInstruction,
  alreadyRepresented,
};
