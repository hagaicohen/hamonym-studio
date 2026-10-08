-- ─────────────────────────────────────────────────────────
-- 070_email_logs_idempotency.sql
-- Transactional-email idempotency (2026-10-05, Pilot Email P0).
--
-- Three new P0 transactional emails (entity approved / entity rejected /
-- recurring charge failed) are triggered from paths that can legitimately
-- run more than once for the SAME logical event:
--   * a CardCom DetailRecurring webhook can be redelivered (and
--     webhook-recovery.job.js deliberately re-runs stored payloads through
--     the same handler),
--   * a Super Admin can click approve/reject twice, or a request can be
--     retried by the browser/proxy.
-- email_logs had no uniqueness of any kind beyond its own PK, so nothing
-- stopped the donor/entity admin from getting the same email twice.
--
-- Mechanism is the one already proven by billing_setup_notifications
-- (migration 062): a stable logical key + INSERT ... ON CONFLICT DO
-- NOTHING, so the dedup guarantee is the index itself — atomic even under
-- two concurrent webhook redeliveries — not a prior SELECT. Deliberately
-- reuses email_logs rather than adding a third notification-ledger table:
-- email_logs is already the single record of every send attempt, and a
-- per-flow table would have to be invented again for every future
-- transactional email.
--
-- A plain (not partial) unique index is correct here: Postgres treats NULLs
-- as distinct, so the many existing/legacy unkeyed emails (receipt,
-- reset-password, invite-admin, billing-setup-required) keep inserting
-- freely with idempotency_key IS NULL and are completely unaffected.
--
-- `payload` stores the logical send intent for keyed emails ONLY, so a row
-- left stranded in status='pending' (process died between claiming the key
-- and finishing the provider call) can be re-dispatched from the stored
-- intent instead of being permanently lost behind a consumed key. Same
-- precedent as cardcom_webhook_events.raw_payload + webhook-recovery.job.js:
-- store what the handler needs, re-run the handler. See
-- email-dispatch-recovery.job.js.
-- ─────────────────────────────────────────────────────────

ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS email_logs_idempotency_key_unique
  ON email_logs (idempotency_key);

-- Recovery-job lookup: only ever scans the handful of rows still mid-flight.
CREATE INDEX IF NOT EXISTS idx_email_logs_pending
  ON email_logs (created_at)
  WHERE status = 'pending';
