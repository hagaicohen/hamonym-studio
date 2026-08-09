const crypto = require('crypto');
const db = require('../../../db/db');

function hashPayload(provider, payload) {
  return crypto.createHash('sha256').update(`${provider}:${JSON.stringify(payload)}`).digest('hex');
}

// Atomically claims a webhook delivery — the exact same payload arriving
// twice (a duplicate Cardcom delivery, a proxy retry) hits the UNIQUE
// constraint on payload_hash and is reported as not-new, so the caller can
// skip processing instead of finalizing/charging the same event twice. Also
// serves as the Audit Log's write (see cardcom_webhook_events, migration
// 042) — the two steps documented separately in
// PAYMENTS_ARCHITECTURE_CONTEXT.md's flow collapse into one atomic INSERT
// here, since "check idempotency" and "write the audit row" are the same
// operation if done correctly (a check-then-insert elsewhere would race).
//
// `provider` is unused beyond the hash today — this table is Cardcom-only by
// design (see docs/CARDCOM_INTEGRATION.md), not a shared multi-provider audit
// log. It's part of the signature so the call site doesn't need to change if
// that ever gets revisited.
exports.claim = async ({ provider, payload }) => {
  const hash = hashPayload(provider, payload);

  const res = await db.query(
    `INSERT INTO cardcom_webhook_events (payload_hash, raw_payload, record_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (payload_hash) DO NOTHING
     RETURNING id`,
    [hash, JSON.stringify(payload), payload?.RecordType || null]
  );

  const row = res.rows[0];
  return { isNew: !!row, eventId: row?.id || null };
};
