-- Backs both the Idempotency Check and the Audit Log steps of the Charging
-- Engine webhook flow (docs/PAYMENTS_ARCHITECTURE_CONTEXT.md). One row per
-- distinct webhook delivery: payload_hash is the idempotency key (a duplicate
-- Cardcom delivery, or an accidental retry, hits the UNIQUE constraint and is
-- skipped rather than processed twice); raw_payload is the audit trail.
CREATE TABLE IF NOT EXISTS cardcom_webhook_events (
  id            SERIAL PRIMARY KEY,
  payload_hash  TEXT NOT NULL UNIQUE,
  raw_payload   JSONB NOT NULL,
  record_type   TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_cardcom_webhook_events_record_type
  ON cardcom_webhook_events (record_type);
