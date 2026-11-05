-- Local preparation only. Shared application requires explicit migration approval.
-- 086: organization category suggestions ("חסרה קטגוריה? הציעו קטגוריה חדשה").
-- Suggestions are review input for Super Admin only. Approving or rejecting
-- one never changes the official category list (entity-categories.js /
-- entity-categories.ts) or any entity's categories.
-- Additive: one new table, no change to existing tables or data.
-- Rollback: scripts/rollback-086-category-suggestions.sql
BEGIN;

CREATE TABLE public.category_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  -- Lower-cased, niqqud/quote-free, single-spaced label; computed by
  -- category-suggestions.service.js and used for duplicate detection.
  normalized_label text NOT NULL,
  suggested_by_user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_suggestions_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT category_suggestions_label_length CHECK (char_length(btrim(label)) BETWEEN 2 AND 60),
  CONSTRAINT category_suggestions_note_length CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  CONSTRAINT category_suggestions_review_consistency CHECK (
    (status = 'pending' AND reviewed_at IS NULL) OR (status <> 'pending' AND reviewed_at IS NOT NULL)
  )
);

-- At most one pending suggestion per normalized label.
CREATE UNIQUE INDEX category_suggestions_pending_label_unique
  ON public.category_suggestions (normalized_label) WHERE status = 'pending';

CREATE INDEX category_suggestions_status_created_idx
  ON public.category_suggestions (status, created_at DESC);

-- Per-user rate limiting reads recent rows by author.
CREATE INDEX category_suggestions_user_created_idx
  ON public.category_suggestions (suggested_by_user_id, created_at DESC);

-- Same as every public table: no Supabase REST (anon/authenticated) access.
-- The backend connects as the table owner, which RLS does not restrict.
ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.category_suggestions FROM PUBLIC, anon, authenticated;

COMMIT;
