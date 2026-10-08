-- ─────────────────────────────────────────────────────────
-- 069_campaign_slug_unique_active_only.sql
-- Slug reuse after delete (2026-09-24) — campaigns.slug had a plain
-- UNIQUE constraint (campaigns_slug_key) with no exception for soft-
-- deleted rows (deleted_at IS NOT NULL), so a deleted campaign's slug
-- stayed permanently unavailable even though the campaign itself is
-- gone from every user-facing view. Replaced with a partial unique
-- index that only enforces uniqueness among non-deleted campaigns —
-- deleted campaigns keep their own slug on their own (still-intact,
-- undeleted) row, they just no longer block a new campaign from reusing
-- it. checkSlugAvailable (campaigns.service.js) updated to match.
-- ─────────────────────────────────────────────────────────

ALTER TABLE campaigns
  DROP CONSTRAINT IF EXISTS campaigns_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_slug_unique_active
  ON campaigns (slug)
  WHERE deleted_at IS NULL;
