# Hamonym Billing Engine — Session Handoff (2026-08-28)

Point-in-time snapshot for picking up in a **new chat**. Not a frozen design doc — see `HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md` for that. This file just says: what exists, what was decided, what's still open, what's next.

## Where we are, in one line

`Donation → Verification (Gate v1) → Billing Effective Time → Calculation (draft Statement) → Approval (financial commit)` is **built, tested, committed**. Collection is **not started** — the last thing done this session was a read-only audit of the existing `entity_billing` module to inform how Collection should eventually connect to it.

## The process this whole effort followed

Every phase went: **audit (read-only) → user reviews findings → explicit approval → implementation → pre-flight test in a rolled-back transaction → real migration → post-flight verification → tests → cleanup → commit → report**. No implementation ever happened without an explicit prior approval message. No commit ever bundled unrelated files. Nothing was ever pushed (`git push`) — everything below is commits on local `main` only.

## Migrations, in order (all in `hamonym-backend/migrations/`, all run for real against production)

| # | What it did |
|---|---|
| 054 | Billing Engine Phase 1 core schema: `billing_accounts`, `billing_periods` (GiST non-overlap), `billing_runs`, `statements`, `statement_components`. |
| 055 | Financial integrity hardening on `donations`/`receipts`: block deleting a `paid` donation/receipt, freeze `amount/entity_id/campaign_id/is_mock/completed_at/provider_reference/low_profile_id/status` once `paid`. |
| 056 | `donations.client_submission_key` (manual-entry idempotency, F4.1) — UUID per submission intent, unique per entity, frozen once paid. |
| 057 | F2 schema: `donations.provider_charged_at` (nullable), `donations.billing_effective_at` (GENERATED `COALESCE(provider_charged_at, completed_at)`), `statement_components.billing_effective_at_snapshot`. `provider_charged_at` populated by **nothing yet** — CardCom `TranzactionInfo.CreateDate` timezone semantics are still BLOCKED pending official provider confirmation (never sent as of this session). |
| 058 | **Statement lifecycle correction** (see below) — `abandoned` status, `donations.effective_statement_id` (write-once), reworked uniqueness index, `provider_charged_at` also made write-once. |

## The bug that drove migration 058 — important to remember

Original design (054) made "is this donation billed?" equivalent to "does it appear in any `statement_components` row?" But `statement_components` is **unconditionally append-only** (no UPDATE, no DELETE, ever — even while the parent Statement is still `draft`). So a donation that appeared only in an abandoned/superseded draft calculation could **never be billed again** — permanently burned by a draft nobody ever intended to keep.

Fix: consumption is tracked as its own fact, `donations.effective_statement_id` (nullable FK to `statements`, write-once — can be set from `NULL`, can never change to a different value). Only a Statement reaching an **effective** status sets it. `statement_components` stays append-only forever (audit trail of every calculation *attempt*, not of what was actually billed).

**Financially effective statuses**: `approved, open, paid, cancelled, written_off`. **Not effective**: `draft, abandoned`. `abandoned` is fully terminal — no further change of any kind once set.

## What's implemented (all under `hamonym-backend/src/modules/billing-engine/`, deliberately **not** under `src/modules/billing/` — see below)

- **`calculation.service.js`** — `runProductionCalculation(periodId, asOf)`. Selects `paid`, `is_mock=false`, `effective_statement_id IS NULL` donations for an account+period (half-open `[start,end)` on `billing_effective_at`), creates exactly one **draft** Statement + its components per account with activity, skips accounts with zero eligible donations (no ₪0 Statement). All fee/VAT/total math runs as Postgres `NUMERIC` in one SQL query — never a JS `Number` — VAT computed off the already-rounded fee so `total_due` always reconciles exactly. Stops at `draft`; never approves anything.
- **`approval.service.js`** — `approveStatement(id)` / `abandonStatement(id)`. Approval is one transaction: lock the Statement, lock+validate+claim every component donation (`ORDER BY donation id FOR UPDATE` — fixed lock order, prevents deadlocks between two racing approvals), only then flip `draft→approved`. Validates against the **frozen** calculation result (never recomputes from live `billing_accounts` config): production run, has components, each donation paid/non-mock/amount-matches-snapshot/right-entity/unclaimed-or-claimed-by-self, `SUM(snapshots)==gross_raised`. Two overlapping drafts racing the same donation: the loser fails cleanly (`DONATION_ALREADY_CLAIMED_BY_OTHER_STATEMENT`) via lock contention + post-lock re-validation, never a raw trigger error, never a partial claim. Re-approving an already-approved, self-consistent Statement is a no-op success; an inconsistent one throws `APPROVAL_INTEGRITY_VIOLATION` instead of silently succeeding. `abandonStatement` never touches donations.
- **`src/jobs/billing-approval-consistency.job.js`** (registered in `src/jobs/index.js`, **not scheduled** — same as the other 4 existing jobs, nobody has wired an actual cron trigger for any of them yet except via the separate Render Cron Job path documented elsewhere). Detect-only safety net: effective Statement not fully claimed by itself, donation claimed by a non-effective Statement, claimed donation missing from its own components, `gross_raised` drift. Uses the existing `reconciliation_findings` dedup infra, auto-resolves once the underlying state is fixed.

Verified with real-DB tests each phase (pre-flight in rolled-back transactions + real migrations + post-flight checks + behavioral tests, including genuine two-connection concurrency races, not just sequential retries). All test data cleaned up completely each time; production `donations` total stayed at 20 rows / ₪215.00 paid throughout.

## Commits (local `main`, not pushed)

```
19d4d50  Implement Approval Engine — the financial commit point of Billing
d2a81e0  Correct Statement lifecycle and implement Calculation Service (Phase 1)
2763137  Fix comments claiming DetailRecurring/MasterRecurring are no-op stubs
2f33002  Add Billing Effective Time schema (F2 schema only, provider_charged_at unpopulated)
8d5601e  Implement LowProfile Verification Gate v1 for CardCom payments
5cc1c17  Add deterministic idempotency for manual donation creation (F4.1)
a8098df  Add financial integrity hardening for donations/receipts (F3.1)
2195f79  fix(donations): is_mock means only PAYMENT_PROVIDER=mock
97b29a6  Add billing engine Phase 1 schema (calculation core)
6886049  docs: freeze billing engine DB schema v1
7786245  docs: freeze billing calculation pipeline v1
```
Plus, in the separate `hamonym-app` submodule repo: `73f7a87` (F4.1 frontend, idempotency key on manual donation form).

**Still uncommitted, deliberately left alone**: `docs/HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md` (has an old F2-era edit pending, never explicitly approved for commit) and `hamonym-app/src/environments/environment.ts` (pre-existing local change, unrelated to this work). Do not commit either without a fresh explicit instruction.

## Explicit debts / open questions carried forward

1. **CardCom `TranzactionInfo.CreateDate` timezone semantics** — BLOCKED. No question has actually been sent to CardCom yet. Until answered, `provider_charged_at` stays NULL forever and `billing_effective_at` == `completed_at` for every donation. Gate v1 (amount/currency/id verification) is NOT blocked by this and is already live.
2. **`billing_runs` lifecycle** — deliberately did **not** add `abandoned`/`superseded` there. The user's call: see if the Statement-level lifecycle fix makes it unnecessary before touching `billing_runs` at all. Revisit only if a real operational need shows up.
3. **`entity_billing` vs `billing_accounts` vs Collection** — audited read-only this session (see below), **no decision made, nothing implemented**. This is the next real fork in the road.
4. **Zero-activity accounts** — confirmed approved: no Statement created, recorded in `billing_runs.result_summary` only. (Not literally tagged `zero_activity` in the JSON key name yet — currently `zeroActivityAccountIds`; cosmetic, not a behavior gap.)

## `entity_billing` audit (read-only, this session's last action) — for the next conversation to pick up

Found **three separate, currently-unlinked** representations of "how does Hamonym bill/charge this entity":

1. **`entities.billing_method`** (`'credit-card'|'masav'`) + `entities.billing_masav_file_name` — plain columns on `entities`, edited via Settings → Entity Billing section, predates the Billing Engine entirely. No structured IBAN/bank-account-number storage anywhere — MASAV only has an uploaded file reference, nothing a real MASAV batch could be built from yet.
2. **`entity_billing` table** (`src/modules/billing/` — a live, wired, but zero-rows-so-far feature: routes mounted in `server.js`, frontend consumes it via `/api/billing/init-openfields`, an OpenFields CardCom flow that tokenizes a card **through Hamonym's own CardCom terminal** (`HAMONYM_CARDCOM_TERMINAL` env vars, distinct from each entity's own terminal used for accepting donations). Supports token rotation (`is_default`/`status='replaced'`) already. This module's code is rough (heavy `console.log`, some routes defined after `module.exports`, one incomplete ownership check flagged in its own comments) but is **not dead code** — do not delete or rewrite it without a separate decision to do so.
3. **`billing_accounts`** (new Billing Engine table) — `preferred_collection_method` (`'card'|'masav'`), `fee_rate`, `vat_rate`, `enforcement_status`, `masav_ceiling`. Zero rows exist. Nothing currently creates one for any entity, including one that has fully completed `entity_billing`'s OpenFields flow — meaning even a fully-onboarded entity today has no `billing_accounts` row and Calculation Service would silently skip them (its query is `WHERE enforcement_status='active'`).

**No FK or sync mechanism exists between any of these three.** `entities.billing_method` and `billing_accounts.preferred_collection_method` are the same real-world fact stored twice with nothing keeping them consistent.

**Proposed direction (not decided — needs the user's call)**:
- Keep `entity_billing` as the card-instrument custody layer for the `'card'` rail specifically (right shape already: token/last4/exp/holder + rotation history). Don't duplicate token storage inside `billing_accounts`.
- Collection should query `entity_billing WHERE entity_id=X AND is_default=true AND status='active'` **at the moment of an actual charge attempt**, not store a cached pointer that could go stale — open to the alternative (an explicit FK) if there's a reason to prefer it.
- Decide whether `entities.billing_method` gets migrated into / superseded by `billing_accounts.preferred_collection_method` (single source of truth) or kept as a separate entity-facing "declared preference" — the former seems architecturally cleaner but changes an existing, live, user-facing settings flow.
- MASAV needs real structured bank-account data (IBAN/account number) before Collection can do anything with it — currently only a file upload reference exists.
- Whoever builds "create a `billing_accounts` row for an entity" (part of Collection, or maybe belongs earlier, at entity-approval time) needs to also decide where `preferred_collection_method`'s initial value comes from, given the fragmentation above.

**Do not implement Collection, and do not touch `entity_billing`, until this is explicitly resolved.**

## Session addendum — 2026-08-29, autonomous work package (CardCom adapter)

Continuation of the same effort, run autonomously while the user was away, under an explicit rule: known/approved design → proceed and commit without stopping for approval; a genuinely new architectural/business decision → stop that branch only, keep working on everything independent of it. Nothing was pushed. All work is local commits on `main`.

**Result: the one open architectural question from the prior session (CVV2 for token charges) is closed.** Full evidence trail in `docs/CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH_2026-08-28.md` part C — short version: CardCom's own "Do Transaction" API doc states a token-charging terminal "must not require CVV from credit companies" and marks `CVV2` as optional (not mandatory) on that endpoint specifically, while `CardExpirationMMYY` is marked mandatory despite being `nullable` in the OpenAPI schema (nullable ≠ optional, exactly the trap the prior session flagged). `entity_billing` never storing CVV is therefore the correct, documented model, not a gap.

**Implemented and committed:**
- `src/modules/payment/cardcom/cardcom.client.js` — added `chargeToken` (`POST /api/v11/Transactions/Transaction`) and `getTransactionByExternalUniqTran`, matching the verified `TransactionReq`/`GetExternalUniqTranIdStatusReq` contract exactly (no `ApiPassword` at top level — schema has `additionalProperties:false` and `ApiPassword` only exists nested under `Advanced`, required only for refunds; no `CVV2`).
- `src/modules/collection-engine/adapters/cardcom-token-charge.adapter.js` — real implementation. `NOT_IMPLEMENTED` flipped to `false`. `charge()` classifies CardCom's response into `succeeded`/`declined`/`ambiguous`/`technical_failure` (608 duplicate → `ambiguous`, resolved later, never blindly retried; no-response transport errors → `ambiguous`; synchronous 400/401 → `technical_failure`). New `reconcile()` calls `GetTransactionByExternalUniqTran` for ambiguous-attempt resolution (returns `succeeded`/`declined`/`technical_failure`/`not_found` — `not_found` is deliberately not wired into `resolveAttempt`, see `adapter.contract.js`).
- `scripts/test-cardcom-token-charge-adapter.js` — 10 mocked-HTTP unit tests (no test framework exists in this repo; follows the existing `scripts/test-*.js` throwaway-script convention). All pass. No real CardCom call was made or attempted anywhere this session — 603 remains unresolved and untouched.
- Two mechanical bug fixes surfaced by comparing existing code against the *verified* schema (not new design): `billing.service.js`'s token-extraction fallback chain included `result?.Token`/`result?.CardToken`, which are not part of the documented `LowProfileResult` response shape (`additionalProperties:false`) — removed as dead/misleading. `cardcom.service.js`'s OpenFields tokenization call sent `Operation: 'CreateToken'`, which is not a valid value of CardCom's `Operation` enum — corrected to `CreateTokenOnly`. Neither has been empirically exercised yet (entity_billing still has 0 rows; 603 blocks any real call), so "fixed a proven schema mismatch" is the accurate claim, not "fixed a bug we saw fail."
- Removed one `console.log` that printed the extracted CardCom token in `billing.service.js` (directly adjacent to the fallback-chain fix; not a sweep of the module's other pre-existing logging, which stays untouched per the prior session's explicit instruction not to rewrite `entity_billing`/`src/modules/billing/` without a separate decision).
- Fixed a stale `-- NOT RUN YET` header comment on `migrations/059_collection_engine_core.sql` — verified live against production (read-only `information_schema` query) that `collection_attempts`/`payments` already exist with matching columns/triggers; comment-only change, no schema touched.
- Schema check requested for this session (task: does `collection_attempts`/`payments` hold everything the verified CardCom contract needs): **PASS, no migration needed.** `provider_reference TEXT` holds `TranzactionId` (cast to string), `requested_amount`/`amount NUMERIC` matches `Amount`, `collection_attempts.id` (UUID) is the approved `ExternalUniqTranId`.
- Docs updated: this file, `HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md` (§6.1 and open question #1 marked closed), `CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH_2026-08-28.md` (new "Part C" section with the full evidence trail).

**Deliberately not done, with reasons (stop-only-that-branch, not guessed):**
- No scheduled reconciliation job wired up for `ambiguous` attempts. The `reconcile()` capability exists and is tested, but *when* to automatically invoke it (a staleness threshold, like the existing `STALE_AFTER_HOURS=2` in `stale-pending-donations.job.js`) is an undecided retry/business policy — design doc §9 open question #6, explicitly a stop condition per this session's own instructions ("do not choose retry intervals/counts if those are still a business decision").
- No admin/manual "trigger collection for this statement" HTTP route added. `runCollectionForStatement` remains unreachable from any route, same as before this session — adding a route means new IDOR/auth-boundary surface that deserves its own review pass, not a rider on this task.
- MASAV, `billing_receipts`, retry-count/timing policy: untouched, exactly as scoped out by the prior session's design doc.
- Did not attempt to resolve the 603 error itself (no credential/secret changes) — but the CVV2 finding adds one concrete thing to verify once account access is restored: confirm `HAMONYM_CARDCOM_TERMINAL` is provisioned by CardCom as a token/no-CVV-model terminal, not just fix the password.
- Did not touch the `entity_billing`/OpenFields `WebHookUrl` question noticed in passing (CardCom's `CreateLowProfile` schema marks `WebHookUrl` as required and the existing `createOpenFieldsLowProfile` call doesn't send one) — flagged here as a finding for a future session, not fixed, since it's about the tokenization flow's own correctness, not the Collection charge contract this session was scoped to, and the "required-per-OpenAPI-but-maybe-not-enforced" trap cuts both ways (exactly why this session verified CVV2/CardExpirationMMYY empirically against prose docs instead of trusting the annotation alone — the same caution says don't act on this one without the same level of verification).

**No database writes occurred this session beyond the read-only `information_schema` schema check.** No test/financial rows were created in any environment (all adapter tests are pure-function tests against a monkey-patched `axios.post`, no DB, no network).

## Next step, per the user's own framing

Collection is "a different world" — it's not calculating what's owed anymore, it's trying to actually collect it: retries, failures, payment instruments, CardCom/MASAV, receipts to the entity. The user explicitly said: **freeze Calculation Service now** — don't keep "improving" it while building Approval/Collection unless Approval/Collection genuinely exposes a missing invariant. Same freeze now applies to Approval, freshly built this session.
