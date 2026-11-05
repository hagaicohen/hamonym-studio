-- Rollback for migration 086 (category_suggestions). Deploy code without the
-- category-suggestions routes first; this drops all stored suggestions.
-- After running, record it in docs/MIGRATION_HISTORY_NOTES.md (086 stays used).
BEGIN;
DROP TABLE IF EXISTS public.category_suggestions;
COMMIT;
