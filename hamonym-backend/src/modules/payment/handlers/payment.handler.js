const cardcomClient = require('../cardcom/cardcom.client');
const donationsService = require('../../donations/donations.service');

// Payment (Low Profile) — the one-time donation event. The webhook payload
// itself isn't trusted for the transaction result; GetLpResult back to
// Cardcom is, per docs/PAYMENTS_ARCHITECTURE_CONTEXT.md's Charging Engine
// flow. donationId travels as ReturnValue, set when the LowProfile was
// created in donations.service.js::createDonation.
//
// Scope boundary: this file only ever handles LowProfile results. Recurring
// (MasterRecurring/DetailRecurring) and Document events belong in their own
// handler + their own future endpoint (/api/payment/recurring-webhook etc.,
// see docs/CARDCOM_INTEGRATION.md's Architecture Change) — not here.
exports.handle = async (payload) => {
  const donationId = payload.ReturnValue;
  if (!donationId) return;

  const credentials = await donationsService.resolveCardcomCredentials(donationId);

  const result = await cardcomClient.getLpResult({
    ...credentials,
    lowProfileId: payload.LowProfileId,
  });

  if (result?.ResponseCode !== 0) return;

  await donationsService.markDonationPaid(donationId, {
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
};
