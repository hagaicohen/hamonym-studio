-- Billing setup notification retryability (2026-09-10) --
-- migration 062 created billing_setup_notifications as insert-once: the
-- mere existence of a (entity_id, billing_period_id, blocking_reason) row
-- permanently consumed that notification opportunity, regardless of
-- whether the email actually got delivered. In production, EMAIL_ENABLED
-- has never been true, so every real notification logged status='disabled'
-- in email_logs while billing_setup_notifications recorded it as if it had
-- gone out -- an association blocked in August could never be renotified
-- for August even once email delivery is turned on.
--
-- `delivered` tracks the real outcome. A row with delivered=false was
-- attempted but not actually accepted by the provider (disabled/failed) --
-- billing-setup-notification.service.js now treats such a row as eligible
-- for a fresh delivery attempt on the next calculation run, using the SAME
-- row (never a second row for the same entity/period/reason -- the UNIQUE
-- index from migration 062 is untouched). Once delivered=true, the
-- opportunity is genuinely consumed, exactly as migration 062 always
-- intended for a real successful send.
ALTER TABLE billing_setup_notifications
  ADD COLUMN IF NOT EXISTS delivered BOOLEAN NOT NULL DEFAULT false;
