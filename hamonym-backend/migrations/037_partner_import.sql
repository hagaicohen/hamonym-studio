-- Support tables for the AI Website Import (partner-import) feature —
-- classification-only import of a business's own website into a new
-- Partner Profile + Campaign Participation draft. Same "TTL enforced in
-- application code, not here" convention as organization_research_cache
-- (migration 030).
--
-- Deliberately DB-backed rather than in-memory: nodemon restarts the whole
-- process on every backend file save during dev (see src/db/db.js's own
-- comment on this), which would silently wipe an in-memory cache/session
-- store constantly — the exact scenario this cache exists to avoid paying
-- for repeatedly.

-- Cache of a single URL's lossless DOM extraction — reusable across many
-- unrelated import attempts (different campaigns/managers importing the
-- same business site). extractor_version guards against a future
-- extractor-shape change silently handing old-shaped blocks to a resolver.
CREATE TABLE IF NOT EXISTS partner_import_extraction_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  page_title TEXT,
  blocks JSONB NOT NULL,
  found_signals JSONB NOT NULL DEFAULT '{}',
  extractor_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_import_extraction_cache_url ON partner_import_extraction_cache (url);

-- One row per import attempt (opaque sessionId = this row's id). Points at
-- a cache entry rather than duplicating its content — many sessions can
-- share one cached extraction.
CREATE TABLE IF NOT EXISTS partner_import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_cache_id UUID NOT NULL REFERENCES partner_import_extraction_cache(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency for POST /apply — a replayed create-and-link request (double
-- click, retry after a network blip) returns the original result instead
-- of creating a duplicate entity/campaign_partners row.
CREATE TABLE IF NOT EXISTS partner_import_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
