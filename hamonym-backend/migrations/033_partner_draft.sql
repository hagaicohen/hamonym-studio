-- Partner Draft persistence (Phase 3 — Page Builder Owner Context).
-- See docs/PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md.
--
-- Mirrors campaigns.blocks/campaigns.layout exactly (same JSONB shape,
-- same CampaignBlock[]/CampaignLayout types on the frontend, gated at
-- render/edit time by ownerType='partner' instead of 'campaign' — see
-- owner-registry.ts). A Partner Profile's Builder content lives directly on
-- its own entities row, not a separate table — same 1:1 relationship
-- campaigns already have with their own blocks/layout.
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS layout JSONB NOT NULL DEFAULT '{}'::jsonb;
