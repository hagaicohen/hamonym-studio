# FIN-11 scoped Business Clock simulation (local implementation)

Disabled by default. No scheduler/cron registration occurs unless both HAMONYM_SIMULATION_MODE=on and FIN11_SIMULATION_COLLECTION_ENABLED=true. Registered FIN-11 jobs have schedule=null and cannot run through Cron or Admin Run now without a validated simulation context.

## Required explicit configuration (do not put credentials in this document)

- FIN11_SIMULATION_ENTITY_IDS: comma-separated UUID allowlist of explicitly authorized test entities. No default.
- HAMONYM_CARDCOM_TERMINAL: 1000, previously confirmed by the operator with CardCom as Sandbox.
- HAMONYM_CARDCOM_API_NAME: the operator-verified Sandbox API identity.
- FIN11_SANDBOX_VERIFIED=true: explicit operator attestation after checking with CardCom.
- FIN11_SANDBOX_IDENTITY_SHA256: SHA-256 of terminal + a NUL byte + API username; pins the verified identity. A terminal number alone is never proof of Sandbox. A changed API identity fails closed. This is configuration validation, not an independent provider verification request.

Apply migration 075 explicitly to an approved database before deploying this code. No runtime DDL or automatic migration exists. During development it is applied ONLY to the disposable loopback test database.

## Behavior

Existing Super Admin GET /api/platform/simulation-clock is read-only. POST /api/platform/simulation-clock/set-fixed accepts isoDatetime with an explicit Z or UTC offset. It persists FIN-11's scoped clock then automatically dispatches the two existing jobs through job-runner. It does NOT write the shared simulation_clock row. The existing central clock.now() interprets a scoped fixed-time source only for these job runs; unrelated API requests and financial jobs retain their existing clock behavior.

Only pre-existing approved/open statements for allowlisted test entities are candidates. No donation creation/reset, calculation, auto-approval, MASAV export or production scheduling is added. Missing statements are not fabricated. Repeat the same set-fixed request to resume a pending dispatch after restart; no GET or page refresh executes a job. A pending/ambiguous provider transaction still requires the existing reconciliation path, never a blind new charge.

The statement lock plus an immutable persisted business_collection_at and a unique Israel-calendar-day index prevent more than one automatic attempt per statement/day, even after a jump past all retry slots, concurrent requests or restart. Existing retry dates, cap, pending-result checks, holds and MASAV safeguards remain authoritative. Clock movement is forward-only. Each new day still goes through the existing due-date guard.

CardCom and payment received_at/attempt initiated_at/resolved_at retain actual execution time. business_collection_at is inserted atomically with the pending attempt BEFORE any provider call; reconciliation does not modify it. Collection Ops shows the business date and time when present and retains actual execution time separately (API latest_collection_at and UI tooltip). Attempt and payment history remain intact.

## Isolated checks

scripts/test-fin11-business-clock-isolated.js never reads .env, connects only to 127.0.0.1:55437 / hamonym_fin11_clock_test, applies 050/059/075 to unique test schemas, blocks all unmocked imports and replaces payment adapters with in-memory fakes. No real or Sandbox HTTP payment request is made. HAMONYM_TEST_PG_MODULE may point to the already installed pg package when using the isolated worktree without node_modules.

No production environment settings are changed by this implementation. Review the migration and pinned Sandbox identity before any separate activation approval.


## Controlled deployment preparation (2026-10-22; nothing activated)

Target: existing Render web service hamonym-studio (https://hamonym-studio.onrender.com), linked GitHub main with Auto-Deploy. Separate service hamonym-jobs-cron runs node src/jobs/cron-entry.js. Treat their databases as shared production Supabase, as previously confirmed by the operator; current Render connection/environment values cannot be independently verified without authenticated Render access. Local Supabase metadata was inspected SELECT-only: users.id is bigint, collection_attempts.id/statement_id are uuid, real timestamp columns are timestamptz, and migration 075 objects are absent. The global simulation_clock table currently has no id=1 row. Recheck at activation because this can change.

Authorized preparation scope: only Keshet Nehusha / entity 93b16891-ba84-43b6-815e-31cbf749cba0. Proposed FIN11_SIMULATION_ENTITY_IDS must equal exactly this UUID (one entity, no wildcard). This is a deployment plan, not an applied environment change. Its existing October debt is paid: do not reset it or delete history. An explicitly approved fresh test obligation is required before a later payment test.

Exact future sequence, each external step subject to separate approval:

1. Verify Render service identities, database targets and separate environments. Keep FIN11_SIMULATION_COLLECTION_ENABLED=false in BOTH hamonym-studio and hamonym-jobs-cron. Keep web ENABLE_JOB_SCHEDULER=false. Do not change Cron cadence/command or activate production FIN-11. Do not enable HAMONYM_SIMULATION_MODE for preparation; retain existing settings pending review.
2. Review migration 075 and obtain specific approval to apply it to the identified shared database. Take the normal schema backup/checkpoint and run the entire migration ONCE in one transaction with stop-on-error. The nullable column requires no historical backfill; actual timestamps stay unchanged. ALTER TABLE and the non-concurrent unique index require locks, so use a controlled window. This file is deliberately not an automatic startup migration and is not blindly rerunnable after partial execution.
3. After successful schema verification, integrate the reviewed backend commit into latest GitHub main with a normal fast-forward/merge preserving newer commits. Only after deployment approval, push; main auto-deploys Render. Migration MUST precede the backend release, because statement-list SELECTs read business_collection_at even with simulation disabled. Verify the new commit Live, service health and the protected read-only API. No clock change is part of deployment.
4. Use the separately committed compatible frontend. Check local Angular still targets Render; do not publish unrelated frontend commits or environment changes.
5. Preparation ends with collection disabled. Only a later activation approval may configure HAMONYM_SIMULATION_MODE=on and FIN11_SIMULATION_COLLECTION_ENABLED=true on hamonym-studio, the one-entity allowlist, operator-verified Sandbox terminal/API name, FIN11_SANDBOX_VERIFIED=true and FIN11_SANDBOX_IDENTITY_SHA256. Pin = SHA-256 of the terminal string, one NUL byte, then the API username. Never print the API identity or tokens. No password is added to the token-charge endpoint. Cron keeps collection disabled; its separate environment must be checked explicitly. Inspect the existing global simulation_clock again before turning simulation mode on, since other business logic can read it.
6. A separate explicit payment-test approval is required before POST set-fixed. The simulation uses only pre-existing approved/open test statements and never resets or manufactures financial data. Supabase remains shared: this is application-level entity isolation, not database/network isolation. Do not claim physical production isolation.

Remaining verifications: authenticated Render service/env/Live checks, confirmation of the pinned Sandbox API identity with CardCom, and approved fresh test debt. No migration, environment edit, clock update, payment, push or deploy was performed for this preparation.
