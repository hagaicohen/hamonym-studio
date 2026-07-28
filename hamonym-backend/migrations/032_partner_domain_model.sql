-- Partner Domain Model (Phase 2 — Domain Foundation)
-- See docs/PARTNER_DOMAIN_MODEL_ADR.md and docs/PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md

-- Platform role is NOT a single-value column on entities (rejected during
-- review — a boolean or an enum both assume an entity holds exactly one
-- role, but the ADR (§7) explicitly locks that an entity can be BOTH an
-- Organization (runs its own campaigns — the existing, implicit default
-- behavior, needs no row of its own) AND a Partner (linkable into other
-- campaigns via campaign_partners) at the same time, and may hold further
-- roles later (sponsor/vendor/municipality/...). A join table is the
-- correct shape: adding a new role later is a data change, not a schema
-- change, and never requires touching every query that checked a fixed set
-- of boolean columns.
--
-- 'organization' is included in the CHECK for symmetry/future use but no
-- row is ever inserted for it today — nothing gates "can this entity run a
-- campaign" on this table (that's simply campaigns.entity_id, unchanged).
-- Only 'partner' rows are actually populated in Phase 2.
CREATE TABLE IF NOT EXISTS entity_roles (
  entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('organization', 'partner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, role)
);

-- CampaignPartner is the center of the campaign<->partner relationship —
-- Reward is optional and subordinate to it (a partner can appear as
-- sponsor-only, reward_id NULL), never the reverse. See ADR §4.
--
-- reward_id is a soft, unenforced reference: rewards/offerings are stored
-- inside campaigns.rewards (JSONB array, app-generated string ids — see
-- campaign-offerings-step.component.ts), not a separate relational table,
-- so there is nothing to add a real FK to.
--
-- partner_entity_id ON DELETE CASCADE deliberately mirrors the existing
-- hard-delete FK map for entities (user_entities etc. — see
-- ENTITY_LIFECYCLE_AND_SEO_CONTEXT.md): a hard-deleted partner's links
-- vanish with it. Ordinary (soft) delete leaves this row in place — the
-- entity row still exists, only entities.deleted_at is set — callers must
-- explicitly check partner status; see campaign-partners.service.js.
CREATE TABLE IF NOT EXISTS campaign_partners (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  partner_entity_id UUID NOT NULL REFERENCES entities(id)  ON DELETE CASCADE,

  reward_id         TEXT,

  -- "order" is a reserved SQL keyword — this is the column named "סדר
  -- הופעה"/order in the ADR.
  display_order     INTEGER NOT NULL DEFAULT 0,
  visible           BOOLEAN NOT NULL DEFAULT true,

  coupon            TEXT,
  campaign_message  TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, partner_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_partners_campaign ON campaign_partners(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_partners_partner  ON campaign_partners(partner_entity_id);
