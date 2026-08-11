-- Idempotency was keyed on a hash of the raw payload text, which is fragile
-- (JSON key order isn't guaranteed stable — see the 2026-08-10 investigation
-- in docs/CARDCOM_INTEGRATION.md). Switching to Cardcom's own business
-- identifiers (TranzactionId, falling back to LowProfileId, falling back to
-- a canonical payload hash) — a real, documented transaction id beats a hash
-- of incidental serialization order.
ALTER TABLE cardcom_webhook_events RENAME COLUMN payload_hash TO idempotency_key;
ALTER TABLE cardcom_webhook_events ADD COLUMN IF NOT EXISTS key_type TEXT;
