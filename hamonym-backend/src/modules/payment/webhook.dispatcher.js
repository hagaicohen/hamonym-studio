const paymentHandler = require('./handlers/payment.handler');
const masterRecurringHandler = require('./handlers/master-recurring.handler');
const detailRecurringHandler = require('./handlers/detail-recurring.handler');
const documentHandler = require('./handlers/document.handler');

// Routes a Cardcom webhook payload to its business handler — nothing else.
// Kept deliberately thin (see docs/CARDCOM_INTEGRATION.md's Responsibility
// split) so adding a future event type (Chargeback, Token Replacement) is a
// one-line addition here, not a change to payment.controller.js/service.js.
//
// ASSUMPTION, not yet confirmed against a real Cardcom payload: the field
// distinguishing event types is `payload.RecordType`, using the four
// categories PAYMENTS_ARCHITECTURE_CONTEXT.md names (Payment / MasterRecurring
// / DetailRecurring / Document). Confirm against an actual webhook sample
// before relying on this in production.
module.exports = async function dispatch(payload) {
  switch (payload.RecordType) {
    case 'Payment':
      return paymentHandler.handle(payload);
    case 'MasterRecurring':
      return masterRecurringHandler.handle(payload); // no-op stub, see file
    case 'DetailRecurring':
      return detailRecurringHandler.handle(payload); // no-op stub, see file
    case 'Document':
      return documentHandler.handle(payload); // no-op stub, see file
    default:
      return null;
  }
};
