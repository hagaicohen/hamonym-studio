-- Migration: Registration Options — true data-model separation from Offering/rewards
-- See docs/DECISIONS.md (2026-07-16). Replaces `Offering.type === 'registration'`
-- (an extension of the campaigns.rewards JSONB array, used for donation perks)
-- with a first-class table. A race/event participant category is not a gift a
-- donor receives — it's an admin-defined price tier for who's participating,
-- and now the backend can actually validate it (existence, ownership, price)
-- instead of trusting whatever the client sends.

CREATE TABLE IF NOT EXISTS registration_options (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  key           VARCHAR(100),
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registration_options_campaign ON registration_options(campaign_id);

-- Per-campaign scalar settings: the entity manager names the option concept
-- themselves (e.g. "מסלול" for a race, "סוג תורם" for a donor-tier event,
-- "כרטיס" for a ticketed one) — see docs/DECISIONS.md (2026-07-16).
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS registration_field_label VARCHAR(100);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS registration_field_icon  VARCHAR(10);

-- registration_participants: rename the old Offering-snapshot columns to
-- match the new business concept, and add a live FK. option_key/option_title
-- stay a denormalized snapshot (same philosophy as migration 024's original
-- comment — historical rows stay meaningful even if an option is later
-- edited/deleted); registration_option_id is nullable via ON DELETE SET NULL
-- so deleting an option never breaks past registrations.
ALTER TABLE registration_participants RENAME COLUMN offering_key   TO option_key;
ALTER TABLE registration_participants RENAME COLUMN offering_title TO option_title;
ALTER TABLE registration_participants ADD COLUMN IF NOT EXISTS registration_option_id UUID REFERENCES registration_options(id) ON DELETE SET NULL;
