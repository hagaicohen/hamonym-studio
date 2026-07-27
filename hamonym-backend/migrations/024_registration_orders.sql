-- Migration: Registration Offering MVP (2.3) — Registration Order + Participant
-- See docs/REGISTRATION_OFFERING_SPEC.md §2 and docs/DECISIONS.md (2026-07-14/15).
--
-- Donation stays the sole source of truth for money (status/amount/Cardcom) —
-- these tables are a snapshot layer attached 1:1 to a donation, never the
-- other way around. No status column here on purpose: a participant's
-- paid/failed state is always derived by joining to donations.status.

CREATE TABLE IF NOT EXISTS registration_orders (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id    UUID         NOT NULL UNIQUE REFERENCES donations(id) ON DELETE CASCADE,
  campaign_id    UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- offering_key/offering_title are a snapshot (not a live FK — Offerings live
-- inside campaigns.rewards JSONB, not a normalized table) so historical
-- participant rows stay meaningful even if the Offering is later edited or
-- removed from the campaign builder.
CREATE TABLE IF NOT EXISTS registration_participants (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_order_id  UUID         NOT NULL REFERENCES registration_orders(id) ON DELETE CASCADE,
  offering_key           VARCHAR(100),
  offering_title         VARCHAR(255),
  name                   VARCHAR(255) NOT NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registration_orders_donation      ON registration_orders(donation_id);
CREATE INDEX IF NOT EXISTS idx_registration_orders_campaign      ON registration_orders(campaign_id);
CREATE INDEX IF NOT EXISTS idx_registration_participants_order   ON registration_participants(registration_order_id);
