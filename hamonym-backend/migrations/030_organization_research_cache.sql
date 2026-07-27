-- Cache for organization-research.tool.js's real web_search calls
-- (2026-07-23 feature). Keyed loosely by name/website, not entity_id --
-- research typically happens before any entity exists (during AI Brief
-- generation), and the same real-world org may get researched multiple
-- times by different users/attempts before ever becoming an entity row.
-- A 30-day TTL (enforced in application code, not here) avoids paying for
-- + waiting on a fresh search every single time the same org comes up.
CREATE TABLE IF NOT EXISTS organization_research_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT,
  website_url TEXT,
  research_text TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_research_cache_name ON organization_research_cache (lower(organization_name));
CREATE INDEX IF NOT EXISTS idx_organization_research_cache_website ON organization_research_cache (website_url);
