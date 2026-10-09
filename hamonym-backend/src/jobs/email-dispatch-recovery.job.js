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
// What this does NOT cover, on purpose: the window between a business
// COMMIT and setImmediate actually running dispatch(). No row exists yet in
// that window, so there is nothing to recover from — a hard kill inside
// those few milliseconds loses the notification. Accepted known limitation
// at pilot scale; closing it would mean writing the send intent inside the
// business transaction (a real outbox), which is a larger change than
// these three emails justify today.
//
// Only retries rows younger than 1 day — same coarse safety valve as
// webhook-recovery, so a genuinely unsendable intent is not retried
// forever. `pending` older than that is left visible in email_logs for
// support rather than silently rewritten.
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
      `SELECT id, payload
       FROM email_logs
       WHERE status = 'pending'
         AND payload IS NOT NULL
         AND created_at < $1::timestamptz - INTERVAL '5 minutes'
         AND created_at > $1::timestamptz - INTERVAL '1 day'
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

    return { examined: res.rows.length, sent, stub, disabled, failed };
  },
};
