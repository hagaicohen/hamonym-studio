const cardcomClient = require('../cardcom/cardcom.client');
const donationsService = require('../../donations/donations.service');
const { evaluateGateV1 } = require('../verification-gate');
const { recordFinding } = require('../../../jobs/reconciliation-findings');
const db = require('../../../db/db');

async function holdForVerification(donationId, reasons, extraDetails) {
  await recordFinding(db, {
    jobName: 'payment_verification_gate',
    findingType: 'gate_v1_mismatch',
    severity: 'critical',
    subjectType: 'donation',
    subjectId: donationId,
    details: { reasons, ...extraDetails },
  });
  return { outcome: 'verification_hold', donationId, reasons };
}

// Payment (Low Profile) — the one-time donation event. The webhook payload
// itself isn't trusted for the transaction result; GetLpResult back to
// Cardcom is, per docs/PAYMENTS_ARCHITECTURE_CONTEXT.md's Charging Engine
// flow. donationId travels as ReturnValue, set when the LowProfile was
// created in donations.service.js::createDonation. A successful GetLpResult
// (top-level ResponseCode===0) still passes through Gate v1
// (verification-gate.js) before markDonationPaid — a Gate mismatch holds
// the donation (stays pending, no campaign increment, no receipt) and
// records a reconciliation_findings row instead of throwing, since it's a
// business disagreement with CardCom's own answer, not a technical failure.
//
// Scope boundary: this file only ever handles LowProfile results. Recurring
// (MasterRecurring/DetailRecurring) and Document events belong in their own
// handler + their own future endpoint (/api/payment/recurring-webhook etc.,
// see docs/CARDCOM_INTEGRATION.md's Architecture Change) — not here.
// Returns a small outcome object rather than nothing — added 2026-08-15 so
// callers that re-run this handler outside the live webhook path (currently
// only webhook-recovery.job.js) can tell "not throwing" apart from "actually
// did something". Before this, "ran without throwing" was the only signal
// available, which made e.g. a ReturnValue-less payload or a still-pending
// Cardcom result look identical to a real recovery. Not used by the live
// webhook path itself (payment.controller.js/webhook.dispatcher.js still
// just await it) — this is additive, not a behavior change for them.
exports.handle = async (payload) => {
  const donationId = payload.ReturnValue;
  if (!donationId) return { outcome: 'no_donation_id' };

  const donation = await donationsService.getDonationForVerification(donationId);
  if (!donation) return { outcome: 'donation_not_found', donationId };

  // Gate v1 (frozen 2026-08-28): the webhook body's own LowProfileId is
  // checked against what we stored at LowProfile/Create time BEFORE it is
  // ever used to call GetLpResult — GetLpResult below always queries with
  // the DB's own low_profile_id, never the webhook's, so a mismatched or
  // forged webhook can never steer the lookup at a different transaction.
  if (!donation.low_profile_id) {
    return holdForVerification(donationId, ['db_low_profile_id_missing'], {
      webhookLowProfileId: payload.LowProfileId ?? null,
    });
  }
  if (payload.LowProfileId && String(payload.LowProfileId) !== String(donation.low_profile_id)) {
    return holdForVerification(donationId, ['webhook_low_profile_id_mismatch'], {
      webhookLowProfileId: payload.LowProfileId,
      dbLowProfileId: donation.low_profile_id,
    });
  }

  const credentials = await donationsService.resolveCardcomCredentials(donationId);

  const result = await cardcomClient.getLpResult({
    ...credentials,
    lowProfileId: donation.low_profile_id,
  });

  if (result?.ResponseCode !== 0) return { outcome: 'not_paid_at_cardcom', donationId, responseCode: result?.ResponseCode };

  const gate = evaluateGateV1({ result, donation, donationId });
  if (!gate.pass) {
    return holdForVerification(donationId, gate.reasons, gate.comparison);
  }

  const markResult = await donationsService.markDonationPaid(donationId, {
    providerReference: result?.TranzactionId || result?.LowProfileId || null,
  });

  // Recurring signup completion — no-ops for ordinary donations (no
  // recurring_instruction_id) and is itself idempotent (no-ops if a
  // RecurringId was already created by a previous delivery of this same
  // webhook). Never allowed to affect the donation above, which already
  // succeeded — see docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §5.
  try {
    await require('../../donations/recurring.service').completeSignup(donationId);
  } catch (err) {
    console.error('[payment.handler] completeSignup failed:', err.message);
  }

  return { outcome: markResult.updated ? 'paid' : 'already_paid', donationId };
};
