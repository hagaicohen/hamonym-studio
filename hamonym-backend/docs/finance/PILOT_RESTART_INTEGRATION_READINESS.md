# PILOT restart integration readiness ? 2026-10-29

Local preparation only. No commit, push, deployment, shared migration, shared financial write, clock change, provider call or Render service resumption.

## Integrated behavior

- Reconciliation Cron and manual Admin action share get-reconciliation-adapter.js. Selection uses the immutable historical attempt's stored provider and the entity joined from its Statement/billing account. Unknown/null provider or missing entity fails closed; no mock fallback.
- fin11_mock reconciliation receives attemptId + entityId. CardCom platform-fee access still throws REAL_COLLECTION_DISABLED_DURING_PILOT before external access. MASAV remains outside card reconciliation.
- New legacy mock attempts explicitly persist fin11_mock instead of the old database default cardcom. Historical attempts are not rewritten. Statement locks, payment uniqueness, fee arithmetic, cap, retry rules and existing resolveAttempt remain unchanged.
- Carry-forward uses the existing calculation/approval path and paid + unclaimed + before-period-end eligibility. Closed paid Statements are not reopened. Original timestamps/components and adjustment audit reports survive reuse.
- Donor checkout remains CardCom/OpenFields; official receipts and recurring-document authorization use the existing feature. No mock donor flow was added.
- Donation is_mock removal includes the final obsolete HTTP error mapping. Historical migrations remain immutable.

## Database and migrations

Shared read-only check: 079 receipt_documents and all seven user identity columns are already present. 080 is pending; donations.is_mock still exists. All 16 checked financial tables, campaign fundraising and donor totals are zero. 66 replay tombstones remain; active reset scopes = 0.

Rehearsal: existing migration 079 then 080 passed on isolated PostgreSQL copies, including the latest shared-schema backup clone. After 080, retired donation replay tests rejected all 35 original IDs and 34 new-ID provider identities; FK checks passed. No migration was run on shared Supabase.

080 requires compatible application code to be staged/deployed before column removal. Old code that references is_mock must never run after 080. No CASCADE and no donor/status/amount updates. Backup schema and data before rollout; never roll back the application alone across 080. Use the verified recovery procedure to restore compatibility if required.

## Verification

14 focused Backend suites passed: provider routing, manual reconciliation, stuck-attempt recovery, recurring reconciliation/handler, donor validation/CardCom separation, official receipt PostgreSQL flow, carry-forward, payment resolution, MASAV proposals, retries, billing readiness and dashboard reads.
Additional real-SQL provider-routing integration passed (4 checks); cap regression passed (7/7); manual retry regression passed (29/29).
Provider routing unit checks 10/10; manual reconciliation 14/14; carry-forward/migration checks 18/18; payment-resolution regression 24/24; MASAV proposal regression 36/36.
All SQL mutation tests used isolated Docker PostgreSQL; test connection guard rejects shared endpoints and external HTTPS was blocked.
50 focused Angular receipt/checkout/validation tests passed in ChromeHeadless using a temporary narrowed TypeScript test config. Standard ng test compilation is blocked by unrelated older platform-billing-ops-page fixtures missing required collected fields; no runtime code was changed to suppress that issue.
Production Angular build passed with only build-time font inlining disabled; TLS verification remained enabled. Existing campaign-preview CSS budget warning remains.

Evidence outside Git: C:/HamonymBackups/financial-integration-20261029/. Pre-reset verified full backup: C:/HamonymBackups/financial-reset-20261029/full.dump; use RECOVERY.md beside it.

## Controlled rollout after explicit approval

1. Keep hamonym-studio and hamonym-jobs-cron suspended. Recheck main/approved file scope, snapshot current clean database and record the exact candidate commit. Commit only this approved feature set; preserve unrelated frontend/checkout/progress work. Do not deploy Frontend to cloud; it remains localhost:4200 connected to Render.
2. Verify 079 objects, role/trigger ownership, and absence of unexpected 080 dependencies. 079 is already applied: do not reapply unnecessarily. If genuinely missing, apply 079 transactionally before 080.
3. Build/stage the compatible Backend candidate through the existing main/Render deployment workflow for BOTH services. Verify the intended deployment artifact/commit before allowing any process to start. Keep scheduling/payment credentials unchanged. No provider/activation flags are introduced.
4. With old processes still stopped and a verified backup available, apply 080 transactionally; verify is_mock absent, the eligibility index valid, paid immutability otherwise intact, replay protection present and financial records still zero.
5. The product owner manually resumes hamonym-studio on the verified candidate. Verify running commit, health/startup logs, donation initialization prerequisites without creating a donation, authenticated empty donation/receipt/billing APIs, local Frontend lists and authorization rejection. Do not advance the clock, submit a payment or manually trigger billing.
6. Once Web checks pass, the product owner manually resumes hamonym-jobs-cron on the SAME candidate. Verify normal heartbeat/scheduled logs, no missing-column/unknown-provider errors and no unexpected payments, Statements or attempts. Empty billing-period/job metadata may be created by normal scheduling; this is not financial activity.
7. Read-only smoke checks: zero fundraising, balances and collected totals; preserved users/entities/campaigns/configuration; old donation IDs not found and replay tombstones retained. Real payment-provider access remains blocked for platform-fee collection. CardCom TEST donor checkout/receipt live verification is a separately authorized interactive test, not part of deployment smoke checks.

If Render cannot stage/deploy the new candidate while suspended, stop before applying 080; resolve the deployment ordering first. Never resume an old application against the dropped column. No service has been resumed by this task.
