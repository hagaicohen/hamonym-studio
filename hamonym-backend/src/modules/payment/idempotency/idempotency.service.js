const crypto = require('crypto');
const db = require('../../../db/db');

// Deterministic regardless of key insertion order — plain JSON.stringify()
// isn't (confirmed 2026-08-10: the same logical payload hashed differently
// after a round-trip through Postgres JSONB, which doesn't preserve key
// order). Only used as the last-resort fallback below.
function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Hierarchy of Cardcom's own business identifiers, most specific first —
// TranzactionId (Cardcom's transaction id, confirmed in their docs) beats
// LowProfileId (identifies the checkout session, not necessarily the
// completed charge) beats a canonical-payload hash (last resort for a
// payload shape we haven't seen yet, e.g. a failure that carries neither id
// — unconfirmed, no failure sample exists as of 2026-08-10).
function buildKey(provider, payload) {
  if (payload?.TranzactionId) {
    return { key: `${provider}:transaction:${payload.TranzactionId}`, keyType: 'transaction' };
  }
  if (payload?.LowProfileId) {
    return { key: `${provider}:lowprofile:${payload.LowProfileId}`, keyType: 'lowprofile' };
  }
  const hash = crypto.createHash('sha256').update(canonicalStringify(payload)).digest('hex');
  return { key: `${provider}:payload_hash:${hash}`, keyType: 'payload_hash' };
}

// Atomically claims a webhook delivery — the exact same event arriving twice
// (a duplicate Cardcom delivery, a proxy retry) hits the UNIQUE constraint on
// idempotency_key and is reported as not-new, so the caller can skip
// processing instead of finalizing/charging the same event twice. Also
// serves as the Audit Log's write (see cardcom_webhook_events, migration
// 042/043) — the two steps documented separately in
// PAYMENTS_ARCHITECTURE_CONTEXT.md's flow collapse into one atomic INSERT
// here, since "check idempotency" and "write the audit row" are the same
// operation if done correctly (a check-then-insert elsewhere would race).
exports.claim = async ({ provider, payload }) => {
  const { key, keyType } = buildKey(provider, payload);

  const res = await db.query(
    `INSERT INTO cardcom_webhook_events (idempotency_key, key_type, raw_payload, record_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [key, keyType, JSON.stringify(payload), payload?.RecordType || null]
  );

  const row = res.rows[0];
  return { isNew: !!row, eventId: row?.id || null };
};
