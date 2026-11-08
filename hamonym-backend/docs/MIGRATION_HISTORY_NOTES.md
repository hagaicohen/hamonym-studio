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

## 086 — applied to production (2026-11-04)

- `086_category_suggestions.sql` adds `category_suggestions` (see docs/CATEGORY_SUGGESTIONS.md).
  Additive only. Rollback: `scripts/rollback-086-category-suggestions.sql`.
- Enables RLS and revokes PUBLIC/anon/authenticated, like every public table.
- Before applying: full backup `pre-086-20261104T195353590Z` (sha256 6632258495f0…),
  restored into a network-isolated container; 101 tables, counts and hashes matched.
- Applied 2026-11-04 20:01 UTC, before the backend that uses it was deployed.
  Verified: table, 3 indexes + primary key, RLS on, no REST grants, 0 rows.
  The other 100 tables were unchanged apart from `job_runs`, written by
  scheduled jobs in the same minute.

**086 is used and must not be reused. The next migration is 087.**

## 088 + 089 — bilingual campaign content, applied to production (2026-11-08)

- `088_campaign_content_i18n.sql`: nullable `campaigns.content_i18n JSONB` (English overlay of campaign text)
  and nullable `registration_options.client_uid TEXT`. Rollback: `scripts/rollback-088-campaign-content-i18n.sql`.
- `089_donation_donor_language.sql`: nullable `donations.donor_language TEXT` with a validated CHECK
  (`he`/`en`/NULL); display/communication only. Rollback: `scripts/rollback-089-donation-donor-language.sql`.
- Before applying: full backup `pre-088-20261108T082457965Z` (sha256 4a56cb263ef4…), restored as the container
  superuser into a network-isolated container; 102 tables, counts and row hashes matched, no restore warnings.
  (A first attempt restoring as the non-superuser `postgres` role stopped at `CREATE EXTENSION pg_stat_statements`.)
- Applied 2026-11-08 08:31 UTC (088, then 089), before the backend that uses them was deployed.
  Verified: column types, nullability, no defaults, comments, CHECK validated, 0 non-null values;
  all 102 tables unchanged in row count and data hash (new columns excluded).
- 087 (multi-currency) remains reserved and NOT applied.

**088 and 089 are used. 087 stays reserved. The next new migration is 090.**
