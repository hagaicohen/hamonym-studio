-- Rollback STEP 2 for migration 090 (optional): removes the 090 schema.
-- Only after STEP 1 (scripts/rollback-090-step1-archive-unpublished.sql) and
-- only once the older backend is serving. Runbook: docs/COMMENTS_RELEASE.md.
--
-- Nothing is deleted: before the columns are dropped, every remaining comment
-- (all published after step 1) is archived with its 090 fields, and each
-- campaign's moderation mode is archived, so scripts/restore-090-archived-comments.sql
-- can bring all of it back after 090 is applied again.
-- author_email stays nullable: the older backend always writes an email, and
-- filling NULLs to restore NOT NULL would invent data.
-- One transaction: on any error nothing changes. Repeatable.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'campaign_comments' AND column_name = 'status') THEN
    RAISE NOTICE 'rollback-090 step 2: schema already rolled back; nothing to do.';
    RETURN;
  END IF;
  IF to_regclass('public.campaign_comments_090_archive') IS NULL
     OR EXISTS (SELECT 1 FROM public.campaign_comments WHERE status <> 'published') THEN
    RAISE EXCEPTION 'rollback-090 step 2: run scripts/rollback-090-step1-archive-unpublished.sql first; nothing was changed.';
  END IF;

  LOCK TABLE public.campaign_comments IN EXCLUSIVE MODE;

  INSERT INTO public.campaign_comments_090_archive
    (id, campaign_id, author_name, author_email, content, created_at, status, language, updated_at, submitter_hash)
  SELECT id, campaign_id, author_name, author_email, content, created_at, status, language, updated_at, submitter_hash
    FROM public.campaign_comments
  ON CONFLICT (id) DO UPDATE
    SET status = EXCLUDED.status, language = EXCLUDED.language, updated_at = EXCLUDED.updated_at,
        submitter_hash = EXCLUDED.submitter_hash, archived_at = NOW(), restored_at = NULL
    WHERE campaign_comments_090_archive.content = EXCLUDED.content
      AND campaign_comments_090_archive.campaign_id = EXCLUDED.campaign_id;

  CREATE TABLE IF NOT EXISTS public.campaigns_comments_moderation_090_archive (
    campaign_id          UUID PRIMARY KEY,
    comments_moderation  TEXT NOT NULL,
    archived_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    restored_at          TIMESTAMPTZ
  );
  ALTER TABLE public.campaigns_comments_moderation_090_archive ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.campaigns_comments_moderation_090_archive FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.campaigns_comments_moderation_090_archive FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.campaigns_comments_moderation_090_archive FROM authenticated';
  END IF;
  INSERT INTO public.campaigns_comments_moderation_090_archive (campaign_id, comments_moderation)
  SELECT id, comments_moderation FROM public.campaigns
  ON CONFLICT (campaign_id) DO UPDATE
    SET comments_moderation = EXCLUDED.comments_moderation, archived_at = NOW(), restored_at = NULL;

  DROP INDEX IF EXISTS public.idx_campaign_comments_campaign_status_created;
  DROP INDEX IF EXISTS public.idx_campaign_comments_submitter_created;
  ALTER TABLE public.campaign_comments
    DROP CONSTRAINT IF EXISTS campaign_comments_rollback_published_only,
    DROP CONSTRAINT IF EXISTS campaign_comments_status_check,
    DROP CONSTRAINT IF EXISTS campaign_comments_language_check,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS language,
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS submitter_hash;
  ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_comments_moderation_check,
    DROP COLUMN IF EXISTS comments_moderation;
END
$$;

COMMIT;
