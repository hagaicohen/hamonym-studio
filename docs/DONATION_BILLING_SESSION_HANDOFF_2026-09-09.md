# Hamonym Donation + Billing — Session Handoff (2026-09-09)

Point-in-time snapshot for picking up in a **new chat with zero prior context**. This file documents what was closed this session (Donation CardCom separation, Billing Monthly Cycle v1, production Cron closure) and hands off the next task cleanly. It complements, does not replace, `HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md` (frozen design), `HAMONYM_BILLING_ENGINE_SPEC.md`, `CARDCOM_OPERATIONAL_PROCESSES.md`, and `BILLING_ENGINE_SESSION_HANDOFF_2026-08-28.md` (the prior handoff — CARD Billing and MASAV Billing status below supersedes anything stale in that file, but its historical narrative is still accurate).

**Read this file before touching**: donations, recurring, CardCom credentials/adapters, billing periods/calculation, collection engine, job scheduling, or MASAV. Do not re-investigate anything marked CLOSED below without new evidence.

---

## 1. Donation Engine — final status: CLOSED, proven live

The one-time donation rail (`donor → LowProfile → donation → webhook → GetLpResult verification → paid`) is closed and proven end-to-end in production as of today.

### 1.1 Donation CardCom credential separation (why it was required)

**Root cause investigated this session**: the donation rail (`donations.service.js#createDonation`, `resolveCardcomCredentials`, `resolveCardcomCredentialsForEntity` — the latter also used by `recurring.service.js` for Pause/Resume/Cancel) shared `HAMONYM_CARDCOM_*` env vars with the Billing/Collection Engine's token-charge adapter. On 2026-09-02, `HAMONYM_CARDCOM_TERMINAL`/`API_NAME` were corrected to fix real CARD collection (Billing) — see §4. This broke `GetLpResult` for donations: proven from real production data that the *same* fallback path had worked correctly for two real entities as recently as 2026-08-17 (5 real `paid` donations), then started returning HTTP 401 after the 09-02 rotation. CardCom apparently provisions terminals per capability (token/no-CVV charging vs. LowProfile checkout) — one terminal cannot be assumed to do both. The user explicitly decided **not to reconstruct the old credentials** ("no archaeology") and instead set up the donation rail as an independently-configured integration.

**Implementation** (commit `a2ae03d`, `hamonym-backend/src/modules/donations/donations.service.js`):
- New `HAMONYM_DONATIONS_CARDCOM_TERMINAL` / `_API_NAME` / `_API_PASSWORD` — a dedicated credential set, used ONLY by the donation fallback path.
- New function `resolveDonationFallbackCredentials()` — returns `null` (never throws) if any of the three are missing.
- `credentialsFromEntityRow()` (used by both `resolveCardcomCredentials` and `resolveCardcomCredentialsForEntity`) now throws `DONATION_CARDCOM_FALLBACK_NOT_CONFIGURED` if the donation fallback isn't configured — **it never silently reuses Billing's `HAMONYM_CARDCOM_*` credentials**, even if those are set and valid.
- An entity's own verified CardCom account (`cardcom_connection_status = 'success'`) still takes precedence over both fallbacks, unchanged.
- `donations.service.js` has **zero** remaining code references to `HAMONYM_CARDCOM_*` (grep-verified; only explanatory comments mention it). The Billing/Collection adapter (`cardcom-token-charge.adapter.js`) was never touched.
- Tests: `scripts/test-donation-cardcom-separation.js` (new, 11/11) proves the separation directly — including a real-DB test where Billing env vars are deliberately set to *different* values and never leak into the donation path. `scripts/test-donation-server-validation.js` updated to set its own explicit `HAMONYM_DONATIONS_CARDCOM_*` test values (previously relied on ad hoc local `.env` values).

### 1.2 Web Service verification

Proven directly (not inferred) that the Web Service has `HAMONYM_DONATIONS_CARDCOM_*` correctly configured:
- Manual `stale-pending-donations` run via Admin "Run now" (`job_runs.id=80`, 2026-09-08 21:51:26 UTC, `triggered_by='admin:9'`): `lookupFailed: 0`, `stillPendingAtCardcom: 4` — a real, successful, authenticated `GetLpResult` round-trip to CardCom for 4 old donations. No 401, no config-guard error.
- A **real live test donation** (see §1.3) processed correctly through the live synchronous webhook path on the Web Service.

### 1.3 Donation CardCom Live E2E — PASS (2026-09-09)

Real ₪1.00 donation by the user, entity "גדולים מהחיים" (`ed7dd60a-bd8b-4aa7-86bf-4f11c19b2ecd`), campaign "קיץ כמו כולם" — this entity has no verified CardCom account of its own, so it exercises the donation fallback path end-to-end.

| Fact | Value |
|---|---|
| Donation id | `7cec9f07-d8c1-411d-b22c-d566b65addfa` |
| Created → completed | 2026-09-09 04:03:21 → 04:03:30 UTC (9 seconds — real live checkout) |
| Final status | `paid` |
| LowProfileId | `b366d178-16be-4532-b6a9-55e5c8a3e431` |
| Provider reference | `262019942` |
| Authoritative completion path | **the live webhook** — one `cardcom_webhook_events` row at 04:03:29.571 UTC, `error: null`, one second before `completed_at`. No recovery job ran anywhere near this time. |
| Duplicates | None — exactly one donation row for this `low_profile_id`; no other donation created in this window. |
| Financial side effects | None — zero new statements/payments/collection_attempts/billing_periods. Receipt #78 issued atomically at `completed_at`. Campaign aggregate updated exactly once (`current_amount=208`, `supporters_count=9`). |
| `GetLpResult` verification | Implicit but conclusive: `payment.handler.js#handle` calls `resolveCardcomCredentials` → `getLpResult` synchronously before ever marking a donation paid — this donation reaching `paid` with a real `provider_reference` **is** the successful, authenticated GetLpResult call. |

**Verdict, verbatim from the session**: `DONATION CARDCOM LIVE E2E: PASS`. Do not re-test this. Do not perform another real donation to re-verify it.

### 1.4 Production Cron / scheduler — final status: CLOSED

The Render Cron Job (`hamonym-jobs-cron`, runs `node src/jobs/cron-entry.js` on `*/15 * * * *`) had been silently down 2026-08-28 → 2026-09-07 (10 days, zero `job_runs` rows at all — see §5 for the general scheduler story). It was resumed 2026-09-08 and is now healthy: fresh `scheduler-heartbeat` rows every ~15 minutes, all 8 registered jobs running on their own schedule windows correctly.

**The Cron-specific donation credential saga (fully resolved, sequence for the record)**:
1. Cron resumed 2026-09-08 21:15 UTC (all 8 jobs, including new `billing-monthly-cycle`, ran clean on the first tick).
2. `stale-pending-donations` (hourly) immediately hit HTTP 401 on `GetLpResult` — this is what triggered the whole donation-credential investigation in §1.1.
3. After `HAMONYM_DONATIONS_CARDCOM_*` was added to the **Web Service** and it redeployed, manual "Run now" (Web Service) succeeded (`job_runs.id=80`) — but the natural hourly Cron ticks (`triggered_by='render-cron'`) kept failing with `DONATION_CARDCOM_FALLBACK_NOT_CONFIGURED`, for **7 consecutive hourly runs** (22:00 → 04:00 UTC). Root cause: the Cron Job service has its own **separate** environment variable set from the Web Service — adding the vars to one does not add them to the other. This is the same two-services-two-env-var-sets pattern already known from the earlier Billing credential rotation (see §4).
4. User configured the vars on the Cron Job service too. First attempted verification via a Render Shell one-liner **failed with `Error: Unknown job: stale-pending-donations`** — this was NOT a wrong job name (verified directly: `src/jobs/stale-pending-donations.job.js:35` declares `name: 'stale-pending-donations'`, registered at `src/jobs/index.js:10`, and dozens of real prior `job_runs` rows already used this exact name successfully). The real bug: the suggested one-liner required `job-runner.js` directly, which holds an **empty registry** on its own — job registration only happens as a side effect of requiring `src/jobs/index.js` (exactly what `cron-entry.js` itself does first). Corrected command:
   ```bash
   node -e "require('./src/jobs/index'); require('./src/jobs/job-runner').run('stale-pending-donations', { triggeredBy: 'admin:manual-cron-shell-test' }).then(r => { console.log(JSON.stringify(r)); process.exit(0); })"
   ```
5. **Final, successful Cron-environment verification** (Render Shell, `hamonym-jobs-cron` service, real environment):
   ```json
   {
     "runId": 195,
     "status": "success",
     "result": {
       "checked": 4, "recovered": 0, "stillPendingAtCardcom": 4,
       "gateHeld": 0, "alreadyPaid": 0, "lookupFailed": 0,
       "missingLowProfileIdFound": 2, "autoResolved": 0
     }
   }
   ```
   `lookupFailed: 0` — no config-guard error, no CardCom 401. This is the real Cron Job service's own environment, not the Web Service.

**Verdict, verbatim**: `PRODUCTION CRON: PASS`, `DONATION ENV IN CRON: PASS`, `GETLPRESULT FROM CRON: PASS`, `CARDCOM AUTH: PASS`, `STALE-PENDING POLICY: PASS`, **`DONATION RECOVERY CRON: CLOSED`**. The intermediate natural-window failure at 2026-09-09 05:00 UTC is historical (it predates the Cron Job service actually having the working env vars) — **do not treat it as an open code defect.**

### 1.5 The 4 known stale donations + 2 missing-LowProfileId donations — known, not a bug

- **4 donations** (`1d76c686…`, `84892b44…`, `39c4cc62…`, `1c0a0c27…`, entity "גדולים מהחיים", created 2026-08-04 to 08-11): confirmed via authenticated `GetLpResult` (both the admin-triggered and the Cron-environment runs) that CardCom genuinely has no successful transaction for these — real checkout abandonments, not lost webhooks. They correctly stay `pending` forever; `stale-pending-donations.job.js` deliberately never converts old `pending` to `failed` (documented business decision, not a gap).
- **2 donations** (`0ef7c44b…`, `b16d41d8…`, ₪180 each, 2026-08-03): never got a `low_profile_id` persisted at all — no CardCom key exists to look them up by. Flagged via `reconciliation_findings` (`pending_donation_missing_low_profile_id`), requires manual business decision (contact donor / write off), not auto-recoverable by any job.
- Housekeeping only, not urgent: the 4 old `lookup_failed` findings (81–84, from the 401-era) are now stale — the problem is gone — but won't auto-clear until the donation's own status changes (auto-resolve is keyed to donation status, not lookup success). Can be manually resolved in CardCom Operations whenever convenient.

---

## 2. Billing Monthly Cycle v1 — status: CLOSED (commit `8b6af39`)

New job `src/jobs/billing-monthly-cycle.job.js`, schedule `0 3 1 * *` (03:00 UTC, 1st of month). On each run: ensures exactly one `billing_period` exists for the immediately preceding calendar month, and runs `calculation.service.js#runProductionCalculation` against it **exactly once** (idempotent — skips if the period already has any `billing_run`). Never approves, never collects, never touches MASAV — reuses proven services, never re-implements financial logic. Does NOT use `billing-ops.service.js#createPeriod/calculatePeriod` (those require a real `super_admin_user_id`, `platform_audit_log.super_admin_user_id` is `NOT NULL`) — this job's own `job_runs.result_summary` is its audit trail, same convention as every other job.

`schedule-window.js`'s cron-match lookback was raised from 3 days to 40 days to let this monthly cadence catch up after any realistic Render Cron outage.

Tests: `scripts/test-billing-monthly-cycle.js` (17/17) — pure date-boundary math (incl. January→December year rollover), real-DB period-creation/idempotency/overlap-mismatch fixtures, a static source-scan proving the job never requires approval/collection/MASAV services, and scheduler-heartbeat classification tests.

**Verified live in production**: ran cleanly on the first Cron tick after resumption (2026-09-08 20:15:48 UTC) — correctly no-op'd since August's period already existed and was already calculated (`reason: 'already_calculated'`). No period/statement/run duplication.

---

## 3. Scheduler heartbeat — status: CLOSED (commits `8b6af39`, `1b933bc`)

`cron-entry.js` now writes an unconditional heartbeat row (`job_runs.job_name = 'scheduler-heartbeat'`) on every invocation, regardless of which jobs are due. `cardcom-ops.controller.js#getSchedulerHeartbeat(db, now)` (injectable, unit-tested with a fake db) computes `{ lastHeartbeatAt, minutesSinceLastHeartbeat, healthy }` (30-minute tolerance = 2x the 15-min tick). CardCom Operations now shows a distinct `scheduler_not_running` alert, separate from per-job staleness — built specifically because the real 10-day outage only ever showed up as 8 disconnected per-job alerts, with no single fact anyone could point at.

---

## 4. CARD Billing — final status: CLOSED, proven live (prior session, still valid)

Real ₪0.28 charge against real entity "ישראלס" succeeded after two real failures were root-caused and fixed:
- HTTP 401 on the original charge → stale/wrong CardCom credentials in Render (`HAMONYM_CARDCOM_*`) → fixed by rotating credentials 2026-09-02.
- HTTP 400 on the reconciliation lookup → CardCom's own `ResponseCode=9998` ("no successful transaction for this ExternalUniqTranId") → led to a new terminal collection-attempt status, `not_found_confirmed` (migration 064), distinct from the adapter's existing `not_found` outcome.

Final DB-verified state: Statement `5ae9f0cf-2f4b-4c28-9b03-4eb54c88a329` `status='paid'`; exactly 2 `collection_attempts` (attempt #1 historical `not_found_confirmed`, attempt #2 `succeeded`, `provider_reference='261873858'`); exactly 1 `payments` row correctly linked to attempt #2; all underlying donations claimed exactly once.

**Do not reopen or redesign the CARD/Collection Engine.** This is a different, deliberately separate credential set from the Donation rail (§1.1) — do not conflate the two again.

---

## 5. MASAV Billing — final status: CLOSED at the engine level, E2E-proven via fixture (prior session, still valid)

Real-DB throwaway-fixture E2E (`scripts/test-masav-e2e-live-fixture.js`) proved the full chain — routing → config → authorization → attempt → Excel export — using the real production functions (`masav-config.service.js`, `masav-collection.service.js`), correctly stopping before any Payment/`paid` transition (v1 boundary: Hamonym's responsibility ends at Excel generation/download; no `recordMasavResult` exists anywhere, by design). Found and fixed a genuine `ddmmyyyy()` bug (real `pg` `Date` objects vs. assumed ISO strings) during this E2E.

**Not yet exercised with a real entity in production** — `entity_masav_details` has 0 rows live as of this writing. No real MASAV collection has ever actually run.

**Known regression, explicitly the next task (§8)**: the MASAV onboarding UI currently does not show the structured fields/explanation already designed. Investigate + fix in the next chat — do not touch MASAV collection/export logic itself while doing so.

---

## 6. Relevant migrations (059–064, no new migrations this session)

| Migration | What |
|---|---|
| 059 | `collection_attempts`/`payments` core, append-only triggers, `ACTIVE_ATTEMPT_STATUSES` |
| 060 | `entity_masav_details` |
| 061 | `billing_periods.retired` |
| 062 | `billing_setup_notifications` dedup table |
| 063 | MASAV authorization-document columns on `entity_masav_details` |
| 064 | `collection_attempts.status` CHECK extended to include `not_found_confirmed` |

No schema changes were made this session (2026-09-08/09) — the monthly-cycle job's idempotency needs were fully satisfiable from existing tables (`billing_periods` + `billing_runs` existence checks), so **no `completed_at`/status field was added to `billing_periods`** — confirmed deliberately unnecessary, per the explicit instruction not to invent one without justification.

---

## 7. Architectural / business invariants a new session must respect

- **Two structurally separate CardCom credential rails, never to be merged**: `HAMONYM_CARDCOM_*` (Billing/Collection Engine — association→Hamonym fee, token charging, proven live) vs. `HAMONYM_DONATIONS_CARDCOM_*` (donor→association donations, LowProfile checkout, proven live). Both are real, both are currently correctly configured on both the Web Service and the Cron Job service. Do not reintroduce a shared fallback between them.
- An entity's own verified CardCom account (`cardcom_connection_status='success'` + all three fields) always takes precedence over either platform fallback — unchanged, never touched this session.
- `donations.effective_statement_id` is the only real consumption marker for Billing eligibility — write-once, DB-enforced (migration 058).
- `payments`/`statement_components`/`receipts` are append-only at the DB level — a real `paid` donation, a real Statement component, or a real receipt can never be deleted. This is why every live-fixture test script in this repo avoids ever creating a real paid donation or real statement_components row (see the header comments in `test-donation-cardcom-separation.js`, `test-masav-e2e-live-fixture.js`, `test-billing-bulk-approval-live-fixture.js`).
- Approval → Collection remains a deliberate, manual, Super-Admin-only gate. `billing-monthly-cycle` stops immediately after calculation — it is structurally incapable of approving, collecting, or creating a Payment (never even requires those services — proven by static source scan).
- The Web Service and the Cron Job service are **two separate Render services with two separate environment variable sets** — a variable added to one is NOT automatically available to the other. This has now bitten twice (Billing credentials, then Donation credentials). Check both explicitly whenever a CardCom-adjacent env var changes.

---

## 8. Known backlog — deliberately NOT blockers, do not reopen unprompted

- `entities.cardcom_api_password_encrypted` is used raw everywhere with no decrypt step despite the column name implying encryption. Only matters for an entity with its *own* verified terminal (neither rail's platform fallback uses it). Flagged twice this session, fixed neither time — intentional, low priority.
- The 2 missing-LowProfileId donations (§1.5) — a business decision (contact donor / write off), not a technical task.
- The 4 stale `lookup_failed` findings (§1.5) — cosmetic, can be manually resolved whenever, not urgent.
- 3 `ZZZ_TEST_DATA_DO_NOT_USE` fixture entities remain unhidden in production (`project_test_data_isolation_backlog` decision, 2026-09-02) — deliberately left as-is, no `entities.is_test` column added.
- A background agent once briefly displayed real CardCom credentials in its own local tool-call transcript on 2026-09-02 (self-caught, never in a final report, no known external exposure) — backlogged as a routine rotate-later item, not urgent.
- Period completion / `billing_periods` status field — explicitly evaluated and found unnecessary for current automation (§6). Do not add one without a new, concrete requirement that actually needs it.

---

## 9. NEXT TASK — MASAV ONBOARDING UI

**This is the first task for the next chat. Do not start it in this one.**

The current MASAV onboarding UI (`hamonym-app/src/app/modules/platform/pages/platform-billing-ops-page/`) is incomplete/regressed relative to what was already designed — it does not currently show all the structured setup fields and explanation. **Investigate why the previously-implemented structured fields disappeared before implementing the fix** — do not assume; check git history / prior component versions.

### Required in the fix

- Restore structured bank fields: account/customer name, bank code, branch code, account number.
- Beneficiary name: **פלנוויז בע"מ**.
- Institution code: **25788** — already implemented prominently with a copy button (commit `1b933bc`, `MASAV_INSTITUTION_CODE` in `platform-billing-ops-page.component.ts`) — verify it's still present/correct as part of this investigation, don't re-do it if it's fine.
- Explain clearly: the bank authorization must be established **without an amount limit and without a duration/time limit**, because Hamonym's charges are percentage-based and depend on actual platform activity/donations plus the agreed commercial fee — so the debit amount is inherently variable, not a fixed predetermined sum.
- Explicitly clarify: unrestricted bank authorization does **not** mean arbitrary charges — actual billing always remains governed by the agreed fee terms and real platform activity.
- Require an **unchecked** acknowledgement checkbox, exact text:
  > קראתי והבנתי כי החיוב באמצעות מס"ב מתבצע בהתאם להיקף הפעילות בפלטפורמה ולשיעור העמלה שנקבע בהתקשרות, ולכן ההרשאה הבנקאית נדרשת ללא הגבלת סכום וללא הגבלת משך זמן.
- The upload step must be labeled **"העלאת אישור הרשאה מהבנק"** (not merely "a signed form").
- Uploading the document and checking the acknowledgement must **NOT** set `authorized=true`. Super Admin explicit `authorize()`/`revoke()` remains the only writer of that boolean — unchanged, do not weaken this.
- Reuse the existing `entity_masav_details` table and existing secure authorization-document storage (`authorization_document_data`/`_name`/`_mime`, migration 063) — **do not create a second MASAV data model.**
- Do **not** change MASAV collection/export behavior (`masav-collection.service.js`, `generateExportExcel`) — this task is onboarding UI only.

### Intended UX flow

```
פרטי חשבון בנק → הקמת הרשאה בבנק (25788) → הסבר ואישור → העלאת אישור הרשאה מהבנק → המתנה לאישור מנהל Hamonym
```

Relevant existing files to start from: `masav-config.service.js` (backend, `upsertBankDetails`/`authorize`/`revoke`/`uploadAuthorizationDocument`/`getAuthorizationDocumentFile`), `platform-billing-ops-page.component.{ts,html,css}` (frontend MASAV tab/drawer), migration `060_masav_configuration.sql` + `063_masav_authorization_document.sql` for the exact schema.
