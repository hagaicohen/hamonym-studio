const paymentHandler = require('./handlers/payment.handler');
const masterRecurringHandler = require('./handlers/master-recurring.handler');
const detailRecurringHandler = require('./handlers/detail-recurring.handler');
const documentHandler = require('./handlers/document.handler');

// Routes a Cardcom webhook payload to its business handler — nothing else.
// Kept deliberately thin (see docs/CARDCOM_INTEGRATION.md's Responsibility
// split) so adding a future event type (Chargeback, Token Replacement) is a
// one-line addition here, not a change to payment.controller.js/service.js.
//
// CONFIRMED WRONG for real one-time Payment traffic (2026-08-10): a real
// LowProfile transaction result carries no `RecordType` field at all — only
// Cardcom's own "Test Webhook" button in the terminal sends one. See
// docs/CARDCOM_INTEGRATION.md's Payload Contract findings. Do NOT add a
// guessed discriminator here yet — that's deliberately deferred until real
// success/failure/cancel samples define the actual contract. This function
// only needs to stop failing *silently* in the meantime — see the `default`
// case below.
module.exports = async function dispatch(payload) {
  switch (payload.RecordType) {
    case 'Payment':
      await paymentHandler.handle(payload);
      return { routed: true };
    case 'MasterRecurring':
      await masterRecurringHandler.handle(payload); // no-op stub, see file
      return { routed: true };
    case 'DetailRecurring':
      await detailRecurringHandler.handle(payload); // no-op stub, see file
      return { routed: true };
    case 'Document':
      await documentHandler.handle(payload); // no-op stub, see file
      return { routed: true };
    default:
      // Received, secret-validated, and already saved to cardcom_webhook_events
      // by the time we get here — this is NOT a failure to handle the event,
      // it's a failure to know which handler it belongs to. Distinct problem,
      // distinct label (see payment.controller.js's use of this).
      return {
        routed: false,
        reason: `No handler matched this payload (RecordType=${payload.RecordType ?? 'missing'})`,
      };
  }
};
