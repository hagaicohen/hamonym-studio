const paymentService =
  require('./payment.service');

const paymentHandler =
  require('./handlers/payment.handler');

const cardcomValidator =
  require('./cardcom/cardcom.validator');

const idempotencyService =
  require('./idempotency/idempotency.service');

const auditService =
  require('./audit/audit.service');

const fs   = require('fs');
const path = require('path');

// TEMPORARY — capturing real Cardcom webhook payloads for the ongoing
// LowProfile contract investigation (see docs/CARDCOM_INTEGRATION.md).
// Delete captureWebhookPayload and its call site below once enough real
// samples (success + failure, at least) have been captured.
async function captureWebhookPayload(payload) {
  const dir = path.join(__dirname, '../../../logs');
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.appendFile(
    path.join(dir, 'cardcom-webhook-capture.jsonl'),
    JSON.stringify({ receivedAt: new Date().toISOString(), payload }) + '\n'
  );
}

exports.handleWebhook =
  async (req, res) => {

    let eventId = null;

    try {

      if (!cardcomValidator.validateWebhookSecret(req.query.secret)) {
        return res.status(401).json({ error: 'Invalid secret' });
      }

      await captureWebhookPayload(req.body); // TEMPORARY, see comment above

      const claim = await idempotencyService.claim({ provider: 'cardcom', payload: req.body });
      eventId = claim.eventId;

      if (!claim.isNew) {
        // Already processed this exact delivery — Cardcom retried, or a
        // proxy resent it. Not an error, just nothing further to do.
        return res.json({ success: true, duplicate: true });
      }

      // POST /api/payment/webhook IS the LowProfile webhook — Cardcom's own
      // WebHookUrl mechanism, set per-request in createDonation's payload, is
      // a separate channel from their Recurring/Document webhook systems
      // (confirmed 2026-08-10: official Cardcom docs + a real captured
      // payload both show no RecordType field here). No routing/dispatch
      // needed — everything arriving on this route is a LowProfile result by
      // definition. See docs/CARDCOM_INTEGRATION.md.
      await paymentHandler.handle(req.body);

      await auditService.recordProcessed(eventId);

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      await auditService.recordProcessed(eventId, { error: err.message });

      res.status(500).json({ error: 'Webhook processing failed' });
    }
  };

exports.testCardcomConnection =
  async (req, res) => {

    try {

      const result =
        await paymentService
          .testCardcomConnection(req.body);

      res.json(result);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        success: false,
        message: 'CardCom connection failed'
      });
    }
  }; 