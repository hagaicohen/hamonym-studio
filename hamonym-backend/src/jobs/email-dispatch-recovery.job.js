// Email Dispatch Recovery (2026-10-05, Pilot Email P0 / Step 9).
//
// Closes exactly one narrow crash window introduced by the idempotency
// claim in email.service.js (migration 070): a keyed email inserts its
// email_logs row as status='pending' BEFORE the provider call, so if the
// process dies between the claim and the terminal status update, that row
// owns the idempotency key forever and nothing would ever retry it —
// turning a transient restart into a permanent, silent non-delivery of a P0
// notification (entity approved/rejected, recurring charge failed).
//
// Mechanism is deliberately the same one webhook-recovery.job.js already
// proved: the intent is stored (email_logs.payload, exactly as
// cardcom_webhook_events.raw_payload is) and recovery is just re-running
// the same send through the same service function — not a parallel
// delivery implementation that could drift. Nothing new is introduced: no
// Redis, no BullMQ, no broker. This is a 15-line SQL scan wired to the
// existing job-runner advisory lock.
//
// FIN-11 final failures are also reconstructed from committed card attempts:
// no email row (or even finding) needs to exist before a process crash.
// Existing emails keep the original pending-only, one-day recovery policy;
// FIN-11 final-failure intents additionally retry failed/old rows.
const { notifyExhaustedCardStatement } = require('../modules/billing-engine/fin11-card-collection.service');

const emailService = require('../modules/email/email.service');

module.exports = {
  name: 'email-dispatch-recovery',
  // Every 10 minutes: this only ever touches rows that are already stuck,
  // and the realistic row count per run is zero.
  schedule: '*/10 * * * *',
  timeoutMs: 2 * 60 * 1000,
  // `now` is BUSINESS time from job-runner.js (src/lib/clock.js) — both
  // bounds below are retry-ELIGIBILITY judgements ("settled long enough to
  // be really stuck" / "young enough to still be worth sending"), so both
  // read from the same business instant. email_logs' own created_at and
  // terminal-status timestamps are written by email.service.js and are
  // untouched here.
  handler: async (db, { now = new Date() } = {}) => {
    const res = await db.query(
      `SELECT id, payload, idempotency_key
       FROM email_logs
       WHERE payload IS NOT NULL
         AND created_at < $1::timestamptz - INTERVAL '5 minutes'
         AND ((status = 'pending' AND created_at > $1::timestamptz - INTERVAL '1 day')
           OR (status IN ('pending', 'failed')
             AND idempotency_key LIKE 'fin11_card_exhausted:%'
             AND payload->'data'->>'eventType' = 'fin11_card_attempts_exhausted'))
       ORDER BY created_at ASC
       LIMIT 50`,
      [now]
    );

    let sent = 0;
    let stub = 0;
    let disabled = 0;
    let failed = 0;

    for (const row of res.rows) {
      const result = await emailService.redispatchPending(row);
      if (result.status === 'sent') sent++;
      else if (result.status === 'stub') stub++;
      else if (result.status === 'disabled') disabled++;
      else failed++;
    }

    // The attempt itself is durable evidence: this covers both a crash before
    // queueing and notification SQL failure. Missing per-recipient email keys
    // are retried until persisted, without modifying any financial record.
    const missing = await db.query(
      `SELECT ca.statement_id
       FROM collection_attempts ca
       JOIN statements s ON s.id = ca.statement_id
       JOIN billing_periods bp ON bp.id = s.billing_period_id
       WHERE ca.collection_method = 'card'
         AND EXISTS (
           SELECT 1 FROM users u
           WHERE u.is_super_admin = true AND u.is_active = true
             AND u.email IS NOT NULL AND u.email <> ''
             AND NOT EXISTS (SELECT 1 FROM email_logs el
               WHERE el.idempotency_key = 'fin11_card_exhausted:' || ca.statement_id::text || ':' || u.id::text)
         )
       GROUP BY ca.statement_id, bp.period_end
       HAVING bool_and(ca.status IN ('declined', 'technical_failure'))
         AND COUNT(*) >= CASE
           WHEN EXTRACT(MONTH FROM bp.period_end AT TIME ZONE 'Asia/Jerusalem') = 2
             AND EXTRACT(DAY FROM date_trunc('month', bp.period_end AT TIME ZONE 'Asia/Jerusalem')
               + INTERVAL '1 month' - INTERVAL '1 day') = 28 THEN 2 ELSE 3 END
       ORDER BY MAX(ca.resolved_at), ca.statement_id
       LIMIT 50`
    );
    for (const row of missing.rows) {
      await notifyExhaustedCardStatement(db, row.statement_id, { recovery: true });
    }

    return { examined: res.rows.length, sent, stub, disabled, failed, reconstructed: missing.rows.length };
  },
};
