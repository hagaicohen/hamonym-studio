# Hamonym Billing Engine — Session Handoff (2026-08-28)

Point-in-time snapshot for picking up in a **new chat**. Not a frozen design doc — see `HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md` for that. This file just says: what exists, what was decided, what's still open, what's next.

## PAUSE + RESUME (2026-08-31) — Donation Engine audit + closure, now done

Between the CardCom milestone below and continuing Billing's operational lifecycle, the user deliberately paused Billing work to fully audit and close the **Donation Engine** first (Billing sits on top of donation facts — no point finishing what's above an unverified foundation). See **`docs/DONATION_ENGINE_CLOSURE_2026-08-31.md`** for the complete audit findings, what was fixed (server-side amount/reward validation, recurring-payment reconciliation for lost webhooks, atomic+idempotent manual registration, several security cleanups) and the final verdict: **DONATION ENGINE: CLOSED**. Read that file before touching donation/recurring/registration code — this file stays Billing-Engine-scoped.

Resuming point for Billing: the "Operational Billing Lifecycle" gap audit from 2026-08-30 (billing_periods/calculation/approval/collection have no automated or admin-triggered entry point at all — see that session's findings) is still exactly where it was left. Nothing below this line was touched during the Donation Engine detour.

## MILESTONE (2026-08-30) — 603 RESOLVED. CardCom authentication PASS. Terminal no-CVV provisioning still unverified.

> **603 root cause: IDENTIFIED — CardCom had rotated the API credentials for terminal 1000; Render's environment still had the old ones.**
> **603 status: 🟢 RESOLVED. User updated the credentials in Render's dashboard (2026-08-30).**
> **CardCom authentication from the live Render deployment: 🟢 VERIFIED**, via a purpose-built, temporary, super-admin-only diagnostic endpoint (`GET /api/platform/cardcom-ops/diagnostics/hamonym-terminal-auth`, commit `64b870f`) that calls the exact `LowProfile/GetLpResult` path that used to fail, with a deliberately non-existent `LowProfileId` (no charge, no card, no token involved). Real result from production, super-admin-authenticated, sanitized:
> ```json
> {"success":true,"authenticationLikelySucceeded":true,"terminalNumber":"1000","httpStatus":200,"cardcomResponseCode":5096,"cardcomDescription":"עסקה ממתינה או לא נמצאה"}
> ```
> `5096` ("transaction pending or not found") is a **business-level** answer, not an auth error — CardCom only gets to that answer after accepting `TerminalNumber`+`ApiName`+`ApiPassword`. This is the proof, not an inference.

## MILESTONE UPDATE (2026-08-30, later same day) — CardCom Collection E2E VERIFIED against the real API

**CardCom Collection protocol + adapter: IMPLEMENTED / LIVE-VERIFIED (not just mock-tested anymore). Recovery orchestration for stuck/ambiguous attempts: IMPLEMENTED, mock-tested (real-DB testing of the success path is unsafe by design — see below).**

Real token created via OpenFields (manual, human, browser action — see Phase 2 below), then ONE real controlled test charge (₪1) executed against production via a temporary diagnostic, calling the actual `cardcom-token-charge.adapter.js` directly (not a copy, not a simulation):

```json
{
  "testEntityId": "ea4c49a4-9f82-48be-a239-a816710f82dd",
  "amount": 1,
  "externalUniqTranId": "91a053f1-ae81-4323-b101-d8a9b62f9002",
  "chargeResult": {
    "outcome": "succeeded",
    "providerReference": "260726786",
    "providerRawStatus": "0:העסקה בוצעה בהצלחה"
  },
  "reconcileResult": {
    "outcome": "succeeded",
    "providerReference": "260726786",
    "providerRawStatus": "0:העסקה בוצעה בהצלחה"
  }
}
```

**Why this result matters, precisely:** `chargeResult.providerReference` and `reconcileResult.providerReference` are **the same value** (`260726786`) — `GetTransactionByExternalUniqTran`, called with the exact `externalUniqTranId` from the charge, found the *same* transaction, not merely *a* transaction. This is the central recovery invariant (below) proven live, not just asserted.

**What this empirically closes out (live evidence, not inference):**
- Hamonym CardCom terminal (`1000`) authentication — PASS (already established earlier the same day).
- OpenFields tokenization → a real, usable `entity_billing` token — PASS (Phase 2/3 below).
- CardCom v11 `Transactions/Transaction` token charge — PASS.
- Token charge **without sending CVV2** actually works against terminal `1000` — PASS. This is the first real (not documentation-only) evidence for the no-CVV token model on *this specific* terminal, not just CardCom's general docs.
- `ExternalUniqTranId` as the reconciliation key, and `GetTransactionByExternalUniqTran` resolving to the identical transaction — PASS.
- No `collection_attempts`/`payments`/`statements` row was created by this test (the diagnostic calls the adapter directly, bypassing the DB pipeline entirely) — confirmed, no financial DB fact was created.

**Still not proven, and not the same claim as the above:** that terminal `1000` is specifically CardCom's *shared public demo* terminal (vs. a real Hamonym-dedicated terminal that simply happens to also not require CVV) — a real charge succeeding doesn't distinguish those two possibilities. Immaterial to whether Collection works; relevant only to a separate future accounting/architecture question already flagged elsewhere as out of scope for Collection.

### Recovery orchestration — implemented (2026-08-30)

The gap flagged earlier the same day ("`reconcile()` exists as a function, but nothing calls it automatically") is closed: `src/jobs/collection-attempt-reconciliation.job.js` was extended from detect-only to detect-and-resolve. For every `collection_attempts` row that is `ambiguous` (checked every run — an ambiguous outcome is already a completed, if inconclusive, answer, not something that could still be in flight) or `pending` past `STUCK_AFTER_HOURS=2` (unchanged threshold from the original detect-only version; exists to avoid racing a genuinely in-flight `charge()` call, not a retry/write-off business policy), it calls `adapter.reconcile()` with the exact same `attemptId`/`ExternalUniqTranId`, then feeds a definitive result into the *same* `resolveAttempt()` the live Router itself uses. `not_found` is left completely untouched (never treated as declined, never triggers a recharge). Concurrent finalization races (this job vs. a live in-flight charge, or two reconciliation runs) are caught via the `payments(provider, provider_reference)` UNIQUE constraint — the losing side's whole transaction rolls back cleanly (Postgres `23505`), handled as an expected outcome, not an error.

**Not scheduled to run automatically** — same status as every other job in this codebase (registered in `src/jobs/index.js`, no cron trigger wired). Nothing in this change turns it on by itself.

**Testing note, important:** tested with 8 mocked unit tests (`scripts/test-collection-attempt-recovery.js`) against a fake `db`/injected `getAdapter`/`resolveAttemptFn` — **not against a real DB**, deliberately. `payments` is append-only-forever by trigger (migration 059) — a real committed test `payments` row from exercising the success path against production could never be deleted afterward, which is exactly the irreversible test fact this whole session has avoided creating. The underlying primitives this job composes (`adapter.reconcile()`'s classification, `resolveAttempt()`'s atomicity) were each already proven independently — this job's own tests verify the *wiring/decision logic* between them, which is what was actually new.

### Temporary diagnostic endpoints — removed after use

Both temporary super-admin diagnostics built earlier the same day to reach this milestone (`GET .../diagnostics/hamonym-terminal-auth`, commit `64b870f`; `POST .../diagnostics/hamonym-token-charge`, commit `c5bcd1a`) have been removed now that they've served their purpose — a standing endpoint capable of making a real CardCom charge has no reason to stay in production. Their evidence is preserved above and in `docs/CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH_2026-08-28.md`. The underlying reusable code they exercised (`billing.service.js#getLowProfileResult`, the adapter itself) was not touched.

Precision reminder, still standing (see [[feedback_precision_of_verified_claims]]): resolving 603 proves the *credentials* work. It does **not** by itself prove `HAMONYM_CARDCOM_TERMINAL` (terminal `1000`) is provisioned by CardCom as a token/no-CVV-model terminal — that is a separate, still-open fact, now the next thing to establish (Phase 2 below), not something 603's resolution silently answers.

- **CardCom protocol — PASS.** The `Transactions/Transaction` request/response contract, the CVV2-not-required-for-token-charges rule, and the `ExternalUniqTranId`/608/`GetTransactionByExternalUniqTran` idempotency mechanism are all verified against CardCom's own official documentation (not inferred from code, not guessed).
- **Hamonym terminal no-CVV provisioning — NOT YET VERIFIED.** Separate fact from authentication. Existing project memory (2026-08-12/13 research) already flagged, as a **strong hypothesis, not proof**, that terminal `1000` is CardCom's shared public demo/test terminal number — it's the exact number used across every official CardCom API example, not something private to Hamonym. The just-confirmed `terminalNumber:"1000"` in the diagnostic result is consistent with that hypothesis but does not newly prove it.

### Phase 2 findings (2026-08-30, read-only code trace) — OpenFields tokenization requires an interactive step, stopped there

Traced the real `entity_billing` tokenization path end-to-end (frontend → backend → CardCom → persistence), to determine what's needed to create one genuine CardCom TEST token under terminal `1000`. No code changed — this section is findings only.

- **Not a redirect-to-hosted-page flow.** `OpenfieldsFormComponent` (`hamonym-app/src/app/modules/billing/components/openfields-form/openfields-form.component.ts`) embeds CardCom's **OpenFields iframe** (`#CardComMasterFrame`) directly in Hamonym's own Settings page and drives it via `postMessage` (`action:'init'` then `action:'doTransaction'`). Card number and CVV are typed inside that CardCom-controlled iframe (PCI scope stays with CardCom); expiration month/year are two plain `<input>` fields on Hamonym's own page (`#expirationMonth`/`#expirationYear` — not sensitive, not PCI scope). On `HandleSubmit`, if the page path includes `/settings/entities/`, it calls `billingService.createEntityBilling(...)` → `POST /api/billing` → `billing.service.js#createBilling` → the token-extraction code fixed earlier this session.
- **Exact path to trigger it:** log in as a real entity owner (or via Super Admin impersonation, if that flow is set up — `require-auth.js` already decodes `impersonatedBy`/`impersonatorName` from the JWT, so the capability exists) → navigate to `/settings/entities/:entityId` → the "אמצעי חיוב" (billing instrument) section → click "חיבור כרטיס" (Connect Card, shown when `entity_billing` has no active row yet, which is every entity today — 0 rows) → the OpenFields iframe loads automatically (`ngOnInit`) → type a card number + CVV into CardCom's iframe fields, a future MM/YY into Hamonym's two plain inputs → click Save, which calls `tokenize()`.
- **This is an irreducibly interactive, human, browser action** — there is no API shortcut and no browser-automation tool available in this session to do it instead. Stopping here exactly as instructed.
- **Do not invent a card number.** CardCom's own official API documentation (the same "Do Transaction" support article already cited for the CVV2 finding, plus this codebase's own pre-existing `cardcom.client.js#testConnection`/`cardcom.service.js` test-connection helpers) already uses `4580000000000000` as its published example/test card number, consistently, across every example. That is the number to type — it is CardCom's own published test value, not something invented for this session. CVV: any 3 digits (their own examples use `123`); the token/no-CVV terminal model means CardCom is documented not to actually check it. Expiration: any real future MM/YY.
- **Confirms terminal `1000` context, but only as corroboration, not new proof:** if that published test card number is accepted by terminal `1000` and produces a real token, that's consistent with `1000` being CardCom's demo/sandbox-behaving terminal (a real production terminal would be expected to reject an obviously-fake card number). Still not definitive on its own — see the precision note above.

**The end-to-end flow now implemented (code) but not yet exercised (live):**

```text
Approved Statement
       │
       ▼
Collection Attempt
       │
       ├── entity_billing
       │      └── Hamonym CardCom Token
       │
       ▼
CardCom v11 /Transactions/Transaction
       │
       ├── SUCCESS
       │      ↓
       │    Payment
       │      ↓
       │   Statement paid
       │
       ├── DECLINED
       │      ↓
       │   retry policy (later, undecided business call)
       │
       └── TIMEOUT / 608 / AMBIGUOUS
              │
              ▼
 GetTransactionByExternalUniqTran
              │
              ├── success  → Payment
              ├── declined → resolve attempt
              └── unknown/technical → remain ambiguous
```

**The central financial invariant — call this out explicitly whenever this system is described, don't bury it:**

> **`collection_attempts.id` is the `ExternalUniqTranId` sent to CardCom on every charge and every lookup for that attempt.**

This is what makes the following crash scenario recoverable without a manual DB fix and, critically, **without ever risking a second real charge**: CardCom charges the association's card → the HTTP response is lost (network drop, Hamonym process crash, anything) → Hamonym never creates the `payments` row. Recovery: look up the same `collection_attempts.id` via `GetTransactionByExternalUniqTran`, find the transaction CardCom actually completed, and finalize locally from that answer — never by resubmitting the charge with a new id.

**Update: this recovery path is now wired, not just callable.** `src/jobs/collection-attempt-reconciliation.job.js` (see "Recovery orchestration" above) drives stuck/ambiguous attempts through `reconcile()` → `resolveAttempt()` automatically whenever it runs — it just isn't scheduled to run automatically yet (no different from every other job in this codebase). "The system recovers from this crash" is now a tested orchestration, not only a code-level capability — with the one caveat that the success path itself is mock-tested, not real-DB-tested, for the append-only-`payments` reason explained above.

**Status of the original step-by-step plan — all done:**
1. ✅ Resolve 603 — done, root cause identified (CardCom rotated credentials), Render updated, live-verified.
2. ⚠️ Confirm `HAMONYM_CARDCOM_TERMINAL` is provisioned token/no-CVV — not formally confirmed via CardCom support, but **empirically proven** by item 4 succeeding without CVV2 being sent at all.
3. ✅ Create one real token on the Hamonym terminal — done (Phase 2/3 below).
4. ✅ Run one small, controlled real test charge — done, ₪1, succeeded.
5. ✅ Inspect the real `TransactionInfo` response — `ResponseCode:0`, `TranzactionId:260726786`, `Description:"העסקה בוצעה בהצלחה"` — matches what this session's adapter code already expected.
6. ✅ Look it up via `GetTransactionByExternalUniqTran` — same `TranzactionId` returned.
7. ✅ **CardCom Collection: E2E VERIFIED** (protocol + adapter + real charge + reconciliation). Recovery orchestration additionally implemented same day.

`billing_receipts` still stays explicitly not started — that was about needing one real transaction through the full path, which now exists, but building a receipt-issuance layer is a separate, un-scoped piece of work, not unblocked by this milestone alone.

## Where we are, in one line

**(Original 2026-08-28 framing below — superseded by the MILESTONE banners at the top of this file. Kept as history, not current status.)** `Donation → Verification (Gate v1) → Billing Effective Time → Calculation (draft Statement) → Approval (financial commit)` is **built, tested, committed**. Collection is **not started** — the last thing done this session was a read-only audit of the existing `entity_billing` module to inform how Collection should eventually connect to it.

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

**Result, precisely stated (2026-08-30 correction — do not collapse this back into a bare "CVV resolved"): CardCom protocol — PASS. Hamonym terminal configuration — NOT YET VERIFIED.** The protocol-level question from the prior session (does CardCom's token-charge contract require CVV2 at all) is closed on documentation evidence: CardCom's own "Do Transaction" API doc states a token-charging terminal "must not require CVV from credit companies" and marks `CVV2` as optional (not mandatory) on that endpoint specifically, while `CardExpirationMMYY` is marked mandatory despite being `nullable` in the OpenAPI schema (nullable ≠ optional, exactly the trap the prior session flagged). `entity_billing` never storing CVV is therefore the correct, documented model, not a gap. **But that guarantee only holds if `HAMONYM_CARDCOM_TERMINAL` is itself provisioned by CardCom as a token/no-CVV-model terminal — and that has not been checked**, because checking it requires account access currently blocked by 603. Full evidence trail in `docs/CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH_2026-08-28.md` part C. Do not report this as "CVV resolved" without the terminal-configuration caveat — the protocol finding and the Hamonym-specific deployment fact are two different claims with two different confidence levels.

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
