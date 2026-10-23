# Campaign test reset — local implementation, not activated

Migration 077 refuses autocommit. Temporary DDL membership/schema CREATE privileges are used only inside its explicit transaction and revoked before commit; runtime application users cannot SET ROLE into the reset role or write its private capability table.

Migration 077 was applied transactionally to shared Supabase after isolated PostgreSQL verification. All 46 existing public tables retained identical row counts and content signatures. No reset was executed; no destructive campaign approval was seeded.
No campaign name is trusted as evidence of test data; use the exact UUID and snapshot hash.

## Before any shared deletion

1. Review/apply 077 transactionally with the migration owner. Do not grant membership of the NOLOGIN reset role to application/authenticated users. The Backend role needs EXECUTE on the two public entry-point functions; it does not need the private reset role.
2. Keep CAMPAIGN_TEST_RESET_ENABLED unset/false. Super Admin selects the exact campaign (including Keshet Nehusha), obtains counts, IDs and SHA-256 from the read-only preview. Review every record and attest that these are authorized test financial facts. No campaign UUID or destructive approval is seeded by the migration.
3. Obtain explicit user approval of that campaign UUID, displayed IDs/counts and SHA-256. Only then may an operator insert a short-lived one-time campaign_reset_approvals row: campaign_id, snapshot_sha256, approved_by (existing Super Admin), meaningful test_evidence, expires_at and NULL used_at. A changed row requires a new preview and approval; consumed approval cannot be reused.
4. Configure CAMPAIGN_TEST_RESET_BACKUP_DIR as an existing protected directory outside every Git repository. Use persistent storage or export the verified file before relying on a Render ephemeral filesystem. Backups contain sensitive financial/donor data: no public hosting or Git. POSIX directories require mode 0700; Windows ACLs must be restricted by the operator. A full DB recovery backup remains recommended.
5. Only after explicit execution approval enable CAMPAIGN_TEST_RESET_ENABLED=true. This flag does not enable FIN-11 or any scheduler. In the UI require typed campaign title and reason; the request binds confirmed=true and the exact preview hash.

## Guarantees and deliberate blockers

The service fsyncs and re-hashes the complete snapshot file before calling the deletion function. The database recomputes the snapshot after NOWAIT parent/child locks and verifies the hash and one-time approval. The transaction also retains a durable private snapshot, actor, reason and backup identifier, retires old provider references against replay, and consumes approval only on success. Failed deletion rolls back all database changes; an already written backup file is retained. No automatic retry after transport/commit uncertainty.

Normal financial trigger bodies remain intact apart from a DELETE-only exception for exact OLD rows under the private role and current transaction capability. There is no DISABLE TRIGGER, replication-role switch, global GUC bypass or change to provider execution/schedulers.

Mixed-campaign statements are blocked: aggregate payments cannot be attributed safely to one campaign. Pending/ambiguous provider operations, recurring instructions, MASAV, payment exceptions, mismatched entity/campaign links and unknown incoming FKs are blocked for review. This is intentionally not a generic financial-data eraser.

Campaign/entity/users/payment configuration, billing accounts, billing periods, billing runs and unrelated financial data are preserved. Only paid donation contributions are subtracted from campaign counters, retaining imported baseline values. Associated findings are resolved, not deleted; receipts/payment sequences are never reset. The actual provider transaction is never cancelled/refunded by deleting local test records.

## Recovery / verification

After success use the returned backupId to locate campaign_reset_private.backups and the protected external JSON file. Verify its SHA-256 against snapshot_sha256. Compare deleted per-table counts and preserved campaign settings with the snapshot. Never overwrite subsequent activity during recovery. Restore the snapshot first into an isolated clone in FK order (donations initially with effective_statement_id NULL, then statements/components, then the write-once link). Retired-reference guards intentionally block casual re-import into the live database; a live restoration requires a separately reviewed recovery operation. Do not remove tombstones to make a test pass.

## Local checks

The PostgreSQL test script only accepts the fixed disposable container hamonym-campaign-reset-tests with NetworkMode=none and the dedicated database name. It reads no .env and loads no provider. SQL/trigger/rollback tests run there; service and UI tests use fail-closed mocks. Never point the test harness at shared Supabase.

## Reusable self-service authorization

An operator may set allow_repeated_resets=true only for an explicitly approved test campaign. Its approval must remain unexpired and its approving Super Admin must still exist. Every UI request still requires a fresh exact snapshot hash, typed campaign title, reason and explicit confirmation. Stale snapshots, pending provider operations, recurring instructions and all other financial guards remain blocked. used_at records the last successful reset; default false retains one-time authorization. No campaigns are automatically authorized. Supabase ADMIN-only membership is not runtime access: migration asserts SET and USAGE are both false.

Supabase default grants to anon/authenticated/service_role are revoked explicitly while temporary ownership membership remains available. Regression fixtures reproduce these default grants and ADMIN-only membership. The external backup directory and reset feature flag must be configured before an approved campaign becomes actionable.
