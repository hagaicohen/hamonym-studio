-- ─────────────────────────────────────────────────────────
-- 068_campaign_publish_requested_at.sql
-- Publication intent (2026-09-24) — separate from and unrelated to
-- migration 067 (recurring donor-chosen installments).
--
-- Distinguishes an ordinary in-progress draft from a campaign the manager
-- has explicitly finished and asked to publish, but which is blocked only
-- by the owning entity not being 'active' yet. NULL = ordinary draft.
-- A timestamp = the manager asked to publish at that moment; the entity-
-- approval flow (platform.service.js#setStatus, 'approve' action only)
-- re-validates and auto-publishes any campaign still eligible once the
-- entity goes active.
-- ─────────────────────────────────────────────────────────

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS publish_requested_at TIMESTAMPTZ NULL;
