-- Rollback for migration 088 (bilingual campaign content). Drops every stored
-- English translation; Hebrew content is untouched (it never lived here).
BEGIN;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS content_i18n;
ALTER TABLE public.registration_options DROP COLUMN IF EXISTS client_uid;
COMMIT;
