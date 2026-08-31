const paymentService =
  require('./payment.service');

const paymentHandler =
  require('./handlers/payment.handler');

const webhookDispatcher =
  require('./webhook.dispatcher');

const cardcomValidator =
  require('./cardcom/cardcom.validator');

const idempotencyService =
  require('./idempotency/idempotency.service');

const auditService =
  require('./audit/audit.service');

// 2026-08-31 (Donation Engine closure WP6): removed captureWebhookPayload,
// which wrote every raw webhook body unredacted to logs/cardcom-webhook-
// capture.jsonl indefinitely. It existed to gather real samples for the
// LowProfile contract investigation, marked "delete once enough samples
// have been captured" -- that investigation closed long ago (this whole
// codebase's webhook handling has since been verified against many real
// captures, see docs/CARDCOM_INTEGRATION.md history). A file nobody was
// ever going to delete, growing forever, unredacted, on the server's own
// disk had no remaining justification.

exports.handleWebhook =
  async (req, res) => {

    let eventId = null;

    try {

      if (!cardcomValidator.validateWebhookSecret(req.query.secret)) {
        return res.status(401).json({ error: 'Invalid secret' });
      }

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

// MasterRecurring/DetailRecurring — a separate Cardcom webhook family from
// LowProfile's (confirmed 2026-08-10, see docs/CARDCOM_INTEGRATION.md's
// Architecture Change), with its own transport quirks confirmed against a
// real captured payload (2026-08-14): application/x-www-form-urlencoded, not
// JSON (see payment.routes.js's body-parser wired only on this route), and
// Secret delivered as a body field, not ?secret= in the URL. RecordType IS
// reliable here (unlike on the LowProfile route), so this goes through
// webhook.dispatcher.js instead of calling a handler directly — see
// docs/CARDCOM_RECURRING_ARCHITECTURE.md's Webhooks section.
//
// MasterRecurring and DetailRecurring are both implemented
// (master-recurring.handler.js, detail-recurring.handler.js). Document
// still falls through to the dispatcher's no-op stub.
exports.handleRecurringWebhook =
  async (req, res) => {

    let eventId = null;

    try {

      if (!cardcomValidator.validateRecurringWebhookSecret(req.body)) {
        return res.status(401).json({ error: 'Invalid secret' });
      }

      // 2026-08-31 (Donation Engine closure WP6): Secret is validated above
      // using the real req.body, then stripped before it's ever hashed for
      // idempotency or persisted to cardcom_webhook_events.raw_payload --
      // that column had no TTL/retention, so the shared secret was being
      // kept in plaintext in the DB forever for every recurring webhook.
      // It's a constant across every delivery, not a per-event value, so
      // removing it doesn't change idempotency-hash uniqueness. Never
      // needed again downstream (webhookDispatcher/its handlers only use
      // business fields).
      const { Secret, ...sanitizedPayload } = req.body;

      const claim = await idempotencyService.claim({ provider: 'cardcom', payload: sanitizedPayload });
      eventId = claim.eventId;

      if (!claim.isNew) {
        return res.json({ success: true, duplicate: true });
      }

      await webhookDispatcher(sanitizedPayload);

      await auditService.recordProcessed(eventId);

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      await auditService.recordProcessed(eventId, { error: err.message });

      res.status(500).json({ error: 'Recurring webhook processing failed' });
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