-- Local preparation only. Shared application requires explicit migration approval.
-- 090: campaign comments moderation (frontend Comments component, 2026-11-09).
-- Comments belong to the campaign (not to a page block, not to a language).
-- Existing comments were published the moment they were posted, so they stay
-- 'published'. The column default stays 'published' on purpose: the backend
-- deployed before this migration inserts without a status, and its comments
-- must stay published exactly as before. The new backend always sets the status
-- itself (pending/published, from the campaign's moderation mode).
-- Email is no longer collected: the column stays for existing rows and is
-- never returned by any endpoint.
-- Rollback (in this order, see docs/COMMENTS_RELEASE.md): scripts/rollback-090-step1-archive-unpublished.sql
-- before any older backend serves traffic, then optionally scripts/rollback-090-campaign-comments-moderation.sql.
BEGIN;

ALTER TABLE public.campaign_comments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS language VARCHAR(2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS submitter_hash TEXT;

ALTER TABLE public.campaign_comments ALTER COLUMN author_email DROP NOT NULL;

-- Re-runnable: constraints are dropped and re-added in the same transaction.
ALTER TABLE public.campaign_comments
  DROP CONSTRAINT IF EXISTS campaign_comments_status_check,
  DROP CONSTRAINT IF EXISTS campaign_comments_language_check,
  ADD CONSTRAINT campaign_comments_status_check CHECK (status IN ('pending', 'published', 'hidden')),
  ADD CONSTRAINT campaign_comments_language_check CHECK (language IS NULL OR language IN ('he', 'en'));

-- Public pages: published comments of one campaign, newest first, keyset paging.
CREATE INDEX IF NOT EXISTS idx_campaign_comments_campaign_status_created
  ON public.campaign_comments (campaign_id, status, created_at DESC, id DESC);
-- Rate limiting by submitter.
CREATE INDEX IF NOT EXISTS idx_campaign_comments_submitter_created
  ON public.campaign_comments (submitter_hash, created_at)
  WHERE submitter_hash IS NOT NULL;

-- Campaigns that already show a comments section keep publishing immediately,
-- as they did before this migration. Only when the column is first created, so
-- a re-run never overrides a mode a manager has chosen since.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'comments_moderation') THEN
    ALTER TABLE public.campaigns ADD COLUMN comments_moderation TEXT NOT NULL DEFAULT 'approval';
    UPDATE public.campaigns
       SET comments_moderation = 'auto'
     WHERE blocks @> '[{"type": "comments"}]'::jsonb
        OR EXISTS (SELECT 1 FROM public.campaign_comments cm WHERE cm.campaign_id = campaigns.id);
  END IF;
END
$$;
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_comments_moderation_check,
  ADD CONSTRAINT campaigns_comments_moderation_check CHECK (comments_moderation IN ('approval', 'auto'));

COMMENT ON COLUMN public.campaign_comments.submitter_hash IS
  'HMAC of the submitter IP, for rate limiting only. Never returned by any endpoint.';
COMMENT ON COLUMN public.campaigns.comments_moderation IS
  'approval = new comments wait for a manager; auto = published immediately.';

COMMIT;
