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
const adminNotifications = require('../modules/email/admin-notification.service');

// Admin/ops notification (event E, 2026-10-07) — raised ONLY on the two
// outcomes where this job gives up on an event: `not_routed` (no handler
// exists for that RecordType) and `failed` (the re-run threw again). An event
// that was actually recovered, or that turned out to be already consistent,
// notifies nothing.
//
// Durable evidence is the cardcom_webhook_events row this job has just
// written `error` to — no new finding type and no new table is introduced for
// this case; the row that already records the problem is the record.
//
// Idempotency is keyed on the webhook event id alone, deliberately NOT on
// the run or the error text: this job re-attempts the same event every 15
// minutes for up to 3 days, and one unprocessable webhook is ONE incident.
// A changed error message on a later attempt is the same incident, so it
// stays silent rather than emailing again.
//
// No raw_payload is ever passed on — a CardCom body can carry donor identity
// and transaction detail. The event id, the record type and the stored error
// are enough to open the real row.
function notifyUnresolved(row, outcome, error) {
  adminNotifications.queueAdminNotification('webhook_recovery_unresolved', {
    incidentKey: `WEBHOOK_UNRESOLVED:${row.id}`,
    data: {
      webhookEventId: row.id,
      recordType: row.record_type || null,
      outcome,
      error,
      receivedAt: row.received_at,
      attemptedAt: new Date().toISOString(),
    },
  });
}

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
  // Approved production schedule (Operational Policy, 2026-08-16): every
  // 15 minutes, automatic — the tightest of the four, since this is the
  // direct safety net for the live payment path itself and Cardcom cost
  // per run is near-zero in practice (only rows already flagged `error`).
  // Not wired to a scheduler yet.
  schedule: '*/15 * * * *',
  timeoutMs: 2 * 60 * 1000,
  // `now` is BUSINESS time from job-runner.js (src/lib/clock.js) — it moves
  // only the 3-day RETRY-ELIGIBILITY window below, i.e. the business
  // judgement "is this failure still worth re-attempting". received_at and
  // processed_at are real event-audit facts and keep their SQL NOW()
  // untouched, as does notifyUnresolved's attemptedAt.
  handler: async (db, { now = new Date() } = {}) => {
    const res = await db.query(
      `SELECT id, record_type, raw_payload, received_at
       FROM cardcom_webhook_events
       WHERE error IS NOT NULL AND received_at > $1::timestamptz - INTERVAL '3 days'
       ORDER BY received_at ASC
       LIMIT 50`,
      [now]
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
            const errorText = `NOT_ROUTED: ${dispatchResult.reason}`;
            await db.query(
              `UPDATE cardcom_webhook_events SET error=$1, processed_at=NOW() WHERE id=$2`,
              [errorText, row.id]
            );
            notifyUnresolved(row, 'not_routed', errorText);
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
        notifyUnresolved(row, 'failed', err.message);
      }
    }

    return { examined: res.rows.length, recovered, alreadyConsistent, processed, notRouted, failed, failedIds };
  },
};
