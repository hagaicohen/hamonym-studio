# Migration history notes

Records migration numbers whose production history differs from the files in
`migrations/`. Check this file before choosing the next migration number.

## 085 — applied and rolled back (2026-11-02)

- `085_first_campaign_intro_seen.sql` added nullable
  `user_entities.first_campaign_intro_seen_at timestamptz` for a per-user
  First Campaign Experience seen state (commit `574868a`).
- Applied to production Supabase on 2026-11-02. No values were ever written
  (0 of 5 rows non-null).
- The product decision changed: the Campaigns welcome screen is now shown
  whenever an organization has no campaigns, with no seen state.
- Code reverted in `b3856a1` (endpoints, migration file, rollback script and
  test removed) and deployed to Render first; the obsolete endpoints were
  verified to return 404.
- The column was then dropped in production with the rollback statement
  `ALTER TABLE public.user_entities DROP COLUMN IF EXISTS first_campaign_intro_seen_at;`.
  Row count unchanged (5).

**085 is used and must not be reused. The next migration is 086.**

## 086 — prepared, not applied (2026-11-03)

- `086_category_suggestions.sql` adds `category_suggestions` (see docs/CATEGORY_SUGGESTIONS.md).
  Additive only. Rollback: `scripts/rollback-086-category-suggestions.sql`.
- Applied and rolled back only on an isolated local test database. Not applied
  to production; that needs explicit approval.
