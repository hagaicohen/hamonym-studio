-- Local preparation only. Shared application requires explicit migration approval.
-- 088: bilingual campaign content (frontend docs/BILINGUAL-I18N-ROADMAP.md, D-38 … D-45).
-- One campaign, two language versions: Hebrew stays in the existing columns
-- (title, short_description, blocks, layout, rewards, updates, sponsors…),
-- unchanged. The English version is an overlay keyed by content path:
--   { "v": 1, "en": { "published": false, "values": { "title": "...", "blocks#<id>.data.content": "..." } } }
-- Structure, styling, goal, donations and every business setting stay shared.
-- Additive: one nullable column, no default, no backfill, no change to existing
-- rows. NULL = never translated (every existing campaign).
-- Rollback: scripts/rollback-088-campaign-content-i18n.sql
BEGIN;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS content_i18n JSONB;

-- Registration options are deleted and re-inserted on every save, so their ids
-- change; the English text of an option is attached to this client-generated
-- identity instead. NULL on every existing row (the editor assigns one on the
-- next save).
ALTER TABLE public.registration_options
  ADD COLUMN IF NOT EXISTS client_uid TEXT;

COMMENT ON COLUMN public.campaigns.content_i18n IS
  'English version of campaign-authored text, keyed by content path; Hebrew stays in the regular columns. NULL = not translated. Exposed publicly only when en.published = true.';

COMMIT;
