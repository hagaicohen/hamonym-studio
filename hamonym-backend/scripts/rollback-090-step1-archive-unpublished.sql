-- Rollback STEP 1 for migration 090 — MANDATORY before any backend older than
-- the comments-moderation release serves traffic again. Runbook:
-- docs/COMMENTS_RELEASE.md (Rollback).
--
-- The older backend lists every row of campaign_comments, so pending and hidden
-- comments must leave that table first. They are moved, unchanged, to
-- campaign_comments_090_archive (restore: scripts/restore-090-archived-comments.sql),
-- and a constraint then allows only published rows in campaign_comments, so the
-- newer backend — while it is still running — cannot create new pending or
-- hidden rows (those requests fail instead of being exposed later).
--
-- One transaction: on any error nothing changes. Repeatable: running it again
-- archives whatever became non-published since (normally nothing) and stops
-- with an error, changing nothing, if an id is already archived with different
-- content — an archived record is never overwritten or discarded.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_comments_090_archive (
  id             UUID PRIMARY KEY,
  campaign_id    UUID NOT NULL,
  author_name    TEXT NOT NULL,
  author_email   TEXT,
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL,
  language       VARCHAR(2),
  updated_at     TIMESTAMPTZ,
  submitter_hash TEXT,
  archived_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_at    TIMESTAMPTZ
);
COMMENT ON TABLE public.campaign_comments_090_archive IS
  'Comments moved out of campaign_comments by the 090 rollback (scripts/rollback-090-*). restored_at = put back by scripts/restore-090-archived-comments.sql.';

-- Like every public table: no access through the REST roles.
ALTER TABLE public.campaign_comments_090_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_comments_090_archive FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.campaign_comments_090_archive FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.campaign_comments_090_archive FROM authenticated';
  END IF;
END
$$;

-- No writes to the live table until this transaction ends (reads continue).
LOCK TABLE public.campaign_comments IN EXCLUSIVE MODE;

INSERT INTO public.campaign_comments_090_archive
  (id, campaign_id, author_name, author_email, content, created_at, status, language, updated_at, submitter_hash)
SELECT id, campaign_id, author_name, author_email, content, created_at, status, language, updated_at, submitter_hash
  FROM public.campaign_comments
 WHERE status <> 'published'
ON CONFLICT (id) DO NOTHING;

-- A row archived earlier and restored since is the same record again: it is
-- archived again (restored_at cleared) only when every field is identical.
UPDATE public.campaign_comments_090_archive a
   SET restored_at = NULL, archived_at = NOW()
  FROM public.campaign_comments c
 WHERE a.id = c.id AND c.status <> 'published' AND a.restored_at IS NOT NULL
   AND (a.campaign_id, a.author_name, a.content, a.created_at, a.status)
       = (c.campaign_id, c.author_name, c.content, c.created_at, c.status)
   AND a.author_email IS NOT DISTINCT FROM c.author_email
   AND a.language IS NOT DISTINCT FROM c.language
   AND a.updated_at IS NOT DISTINCT FROM c.updated_at
   AND a.submitter_hash IS NOT DISTINCT FROM c.submitter_hash;

-- Every row about to leave the live table must be in the archive, identical.
DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing
    FROM public.campaign_comments c
   WHERE c.status <> 'published'
     AND NOT EXISTS (
       SELECT 1 FROM public.campaign_comments_090_archive a
        WHERE a.id = c.id AND a.restored_at IS NULL
          AND (a.campaign_id, a.author_name, a.content, a.created_at, a.status)
              = (c.campaign_id, c.author_name, c.content, c.created_at, c.status)
          AND a.author_email IS NOT DISTINCT FROM c.author_email
          AND a.language IS NOT DISTINCT FROM c.language
          AND a.updated_at IS NOT DISTINCT FROM c.updated_at
          AND a.submitter_hash IS NOT DISTINCT FROM c.submitter_hash);
  IF missing > 0 THEN
    RAISE EXCEPTION 'rollback-090 step 1: % non-published comment(s) conflict with an existing archive record; nothing was changed. Compare campaign_comments with campaign_comments_090_archive by id.', missing;
  END IF;
END
$$;

DELETE FROM public.campaign_comments WHERE status <> 'published';

-- From here on only published comments can exist in the live table.
ALTER TABLE public.campaign_comments
  DROP CONSTRAINT IF EXISTS campaign_comments_rollback_published_only,
  ADD CONSTRAINT campaign_comments_rollback_published_only CHECK (status = 'published');

COMMIT;
