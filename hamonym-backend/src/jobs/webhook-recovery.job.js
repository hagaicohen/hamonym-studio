// B3 — Webhook Recovery (docs/CARDCOM_OPERATIONAL_PROCESSES.md). A webhook
// that Cardcom delivered but Hamonym failed to *process* (claimed —
// cardcom_webhook_events row exists — but processed_at has an error). Needs
// no Cardcom call at all: the raw_payload is already stored, so recovery is
// just re-running the same handler that would have run originally.
//
// Routing mirrors payment.controller.js exactly: record_type IS NULL means
// this came in on the LowProfile route (no RecordType field there, verified
// 2026-08-10), anything else means the Recurring route, dispatched by
// RecordType the same way webhook.dispatcher.js already does.
//
// Coarse safety valve, not a per-event retry counter (that would need a new
// column — deferred, see the operational doc's Part I / this job's report
// note): only retries events from the last 3 days, so a genuinely
// unfixable old failure doesn't get retried forever on every run.
const paymentHandler = require('../modules/payment/handlers/payment.handler');
const webhookDispatcher = require('../modules/payment/webhook.dispatcher');

// Metrics semantics fixed 2026-08-15 (Operational Processes audit finding):
// `recovered` used to mean nothing more than "the handler didn't throw" —
// for the LowProfile route, payment.handler.js's own `handle()` returns
// early (no throw) on a still-pending Cardcom result, a malformed payload,
// or a donation that was already paid, so every one of those was counted
// as a "recovery" even though nothing was actually fixed. payment.handler.js
// now returns an outcome (see its own comment) so this job can tell
// `recovered` (a donation genuinely flipped pending→paid on this run) apart
// from `alreadyConsistent` (nothing needed fixing — includes "still pending
// at Cardcom", which is correct DB state, not a bug).
//
// The Recurring/Document route (dispatched by RecordType) doesn't have that
// same instrumentation — master-recurring/detail-recurring/document handlers
// don't return anything distinguishing "fixed" from "nothing to fix", and
// changing three more handler contracts wasn't part of this pass. Honesty
// over invention: `processed` means only "ran without throwing", not "fixed
// something". The one thing this job CAN prove for that route — the
// dispatcher's `{routed:false}` case, i.e. no handler matched this
// RecordType at all — is deliberately NOT folded into `processed`: that is
// not a success, so its error is preserved instead of cleared, same as an
// actual exception.
module.exports = {
  name: 'webhook-recovery',
  timeoutMs: 2 * 60 * 1000,
  handler: async (db) => {
    const res = await db.query(
      `SELECT id, record_type, raw_payload
       FROM cardcom_webhook_events
       WHERE error IS NOT NULL AND received_at > NOW() - INTERVAL '3 days'
       ORDER BY received_at ASC
       LIMIT 50`
    );

    let recovered = 0;
    let alreadyConsistent = 0;
    let processed = 0;
    let notRouted = 0;
    let failed = 0;
    const failedIds = [];

    for (const row of res.rows) {
      try {
        if (row.record_type) {
          const dispatchResult = await webhookDispatcher(row.raw_payload);
          if (dispatchResult && dispatchResult.routed === false) {
            notRouted++;
            await db.query(
              `UPDATE cardcom_webhook_events SET error=$1, processed_at=NOW() WHERE id=$2`,
              [`NOT_ROUTED: ${dispatchResult.reason}`, row.id]
            );
            continue;
          }
          processed++;
        } else {
          const handleResult = await paymentHandler.handle(row.raw_payload);
          if (handleResult?.outcome === 'paid') recovered++;
          else alreadyConsistent++;
        }
        await db.query(`UPDATE cardcom_webhook_events SET error=NULL, processed_at=NOW() WHERE id=$1`, [row.id]);
      } catch (err) {
        failed++;
        failedIds.push(row.id);
        await db.query(`UPDATE cardcom_webhook_events SET error=$1, processed_at=NOW() WHERE id=$2`, [err.message, row.id]);
      }
    }

    return { examined: res.rows.length, recovered, alreadyConsistent, processed, notRouted, failed, failedIds };
  },
};
