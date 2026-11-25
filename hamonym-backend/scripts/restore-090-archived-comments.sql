-- Restores what the 090 rollback archived (scripts/rollback-090-*), when rolling
-- forward again. Requires the 090 schema: if step 2 removed it, apply
-- migrations/090_campaign_comments_moderation.sql first. Runbook: docs/COMMENTS_RELEASE.md.
--
-- Comments come back with their original id, text, dates and moderation state;
-- a comment already present (same id and text) gets its archived 090 fields
-- back. Campaign moderation modes archived by step 2 are re-applied. Archive
-- rows are kept and marked restored_at, never deleted. Rows whose campaign no
-- longer exists stay in the archive (reported as a NOTICE).
-- One transaction: on any error nothing changes. Repeatable.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'campaign_comments' AND column_name = 'status') THEN
    RAISE EXCEPTION 'restore-090: apply migrations/090_campaign_comments_moderation.sql first; nothing was changed.';
  END IF;
END
$$;

ALTER TABLE public.campaign_comments DROP CONSTRAINT IF EXISTS campaign_comments_rollback_published_only;

DO $$
DECLARE orphaned INT;
BEGIN
  IF to_regclass('public.campaign_comments_090_archive') IS NOT NULL THEN
    INSERT INTO public.campaign_comments
      (id, campaign_id, author_name, author_email, content, created_at, status, language, updated_at, submitter_hash)
    SELECT a.id, a.campaign_id, a.author_name, a.author_email, a.content, a.created_at, a.status, a.language,
           COALESCE(a.updated_at, a.created_at), a.submitter_hash
      FROM public.campaign_comments_090_archive a
     WHERE a.restored_at IS NULL
       AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = a.campaign_id)
    ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status, language = EXCLUDED.language,
          updated_at = EXCLUDED.updated_at, submitter_hash = EXCLUDED.submitter_hash
      WHERE campaign_comments.content = EXCLUDED.content
        AND campaign_comments.campaign_id = EXCLUDED.campaign_id;

    UPDATE public.campaign_comments_090_archive a
       SET restored_at = NOW()
      FROM public.campaign_comments c
     WHERE a.restored_at IS NULL AND c.id = a.id AND c.content = a.content AND c.status = a.status;

    SELECT count(*) INTO orphaned FROM public.campaign_comments_090_archive WHERE restored_at IS NULL;
    IF orphaned > 0 THEN
      RAISE NOTICE 'restore-090: % archived comment(s) not restored (campaign deleted, or a different comment now uses the id); they remain in campaign_comments_090_archive.', orphaned;
    END IF;
  END IF;

  IF to_regclass('public.campaigns_comments_moderation_090_archive') IS NOT NULL THEN
    UPDATE public.campaigns c
       SET comments_moderation = m.comments_moderation
      FROM public.campaigns_comments_moderation_090_archive m
     WHERE m.campaign_id = c.id AND m.restored_at IS NULL;
    UPDATE public.campaigns_comments_moderation_090_archive SET restored_at = NOW() WHERE restored_at IS NULL;
  END IF;
END
$$;

COMMIT;
