# MASAV controlled deployment preparation — 2026-10-30

## Completed database stages
- User confirmed hamonym-studio and hamonym-jobs-cron suspended. Backend HTTP probe returned 503; database inspection found no active application writers/open or prepared transactions. Only idle Supabase infrastructure connections remained.
- Fresh FULL PostgreSQL backup: C:/HamonymBackups/masav-pre081082-20261030-retry1/full.dump, 1621075 bytes. SHA-256 6903f1599d42091f6320c5c81c33f95c5f3c1ccdcb1dc10d05b2e18d9ee4d416.
- Full restore into offline Supabase-compatible PostgreSQL: all 90 non-system tables across application/private/provider schemas matched counts and content signatures. Recovery instructions and all evidence are outside Git in the same backup directory.
- Both migrations rehearsed against the actual restored pilot backup. Old backend 7e234c5 proposal/VAT/historical-outstanding read services and new MASAV read services passed against the migrated isolated copy. No provider requests.
- Shared migration 081 committed and verified at 2026-10-30T13:58:39.489Z; migration 082 at 2026-10-30T13:59:19.735Z. Source SQL and checksums plus per-stage commit proof are in migration081-applied.json and migration082-applied.json outside Git. No existing public application migration ledger exists; the auth/storage migration ledgers were not modified.
- After EACH migration: all 90 original table contents unchanged (settings comparison excludes only the newly added mode column); existing ACLs, ownership and financial protection triggers unchanged. New journals empty, RLS enabled, anon/authenticated read revoked. Default future consolidation mode entity.
- November Statement c54ad3b6-e891-4691-9d07-dd72fbe61d27: total 3540, collected 3000, outstanding 540, status open. Proposal 871da0d9-ff9c-4dff-9b78-14152d2b2437 remains proposed at 540, not approved/exported. No historical exported instructions existed at this checkpoint.
- Independent new-service smoke checks used explicit read-only transactions: original table contents unchanged; proposals accessible; approved-export preview empty; instruction journal empty; effective clock unchanged at 2026-12-06T07:00:00Z; VAT unchanged. Cron module registration inspected without running a job.

## Code delivery boundary
Only approved MASAV consolidation/export, confirmed FIFO results, finalization/residual retries, diagnostics, UI, tests and MD documentation are included. Unrelated frontend work is preserved. Frontend remains local; it is not a cloud deployment target.
Focused Chrome regression run: 33 PASS. Prior isolated recovery/consolidation/manual-export suites: 13+13+7 PASS. Production service/HTTP verification is still REQUIRED and is not replaced by these checks.

## Pending manual Render deployment
No authenticated Render connector, CLI or deployment credential is available in this session. Do not assume a Git push proves a running deployment.
1. Keep both services suspended until the intended backend commit is prepared in Render.
2. In existing hamonym-studio and hamonym-jobs-cron, deploy the intended new backend main commit using the existing repository/root/build/start settings. Do not change environment variables. Do not use Run now or invoke a financial job.
3. Verify each service's deployed commit and successful build/deploy logs. The database already contains 081 and 082; do not rerun them.
4. Only then arrange manual service resumption. Verify backend health/version and readonly financial APIs, then normal scheduled Cron status without triggering jobs manually. No approved proposal export or bank submission is part of this release verification.

Do not restore the shared database automatically. If application deployment fails after these additive migrations, report the live commit and leave services suspended. The old 7e234c5 read path was verified schema-compatible in the restored copy; any rollback/resumption remains a controlled action.
