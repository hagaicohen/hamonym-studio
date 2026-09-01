# Donation Engine — Full Audit + Closure (2026-08-31)

Point-in-time record of a full E2E technical audit of the Donation Engine (requested before resuming Billing Engine operational-lifecycle work, since Billing sits on top of donation facts) and the implementation work that closed its findings. Read this before touching donation/recurring/registration code in a future session — it supersedes ad-hoc assumptions about what's "already handled."

## Audit method

Four parallel read-only research agents traced: (A) the one-time CardCom donation flow, (B) the recurring (MasterRecurring/DetailRecurring) flow, (C) every other donation-producing code path plus reward/amount validation plus CardCom credential routing, (D) security/PCI plus live empirical DB checks. One critical ambiguity every agent flagged independently (whether migrations 055/056's triggers/constraints are actually live, given their file headers still say "NOT RUN YET") was resolved empirically during the audit, not left as a guess: a real rolled-back-transaction `DELETE` against a genuine paid donation was attempted directly against production and was blocked with the exact expected trigger error. **Confirmed live**: `trg_donations_block_paid_delete`, `trg_donations_enforce_paid_immutability`, `uq_donations_entity_client_submission_key`, `uq_donations_recurring_provider_ref`. The stale "NOT RUN YET" headers are a documentation lag (same pattern already found and fixed for migration 059 during the CardCom Collection work) — not a real gap.

## Findings, and what was done about each

| Finding | Severity | Status |
|---|---|---|
| DetailRecurring (monthly recurring charge) trusts the webhook body with no server-to-server verification, unlike the one-time flow's GetLpResult+Gate v1 | CRITICAL | **Accepted as residual risk, explicitly, not fixed** — user's own instruction: an additional per-webhook CardCom verification call is not a mandatory closure requirement, treat as defense-in-depth only. Mitigated indirectly by the new reconciliation job (below), which does not prevent a forged webhook but does catch missing real ones. |
| A lost DetailRecurring webhook (CardCom charged, Hamonym never told) was permanently invisible — no polling, no reconciliation | CRITICAL | **Fixed — WP2.** See below. |
| Public donation amount and reward selection were entirely client-trusted (existence, campaign ownership, minimum amount, inventory) | CRITICAL | **Fixed — WP1.** |
| `stale-pending-donations.job.js` only detected a lost one-time webhook, never repaired it | HIGH | **Fixed — WP3.** |
| Donations invisible to that job when `low_profile_id` was never persisted (crashed before storage) | MEDIUM | **Fixed — WP3** (surfaced as a finding for human review; genuinely not auto-recoverable, no CardCom query key exists for this case). |
| `markDonationPaid` had one caller; manual donation / registration / DetailRecurring / mock each reimplemented the same insert+aggregate+receipt logic independently | HIGH | **Partially fixed — WP2/WP4.** Recurring's webhook and reconciliation paths now share one primitive (`finalizeSuccessfulRecurringCharge`). Manual donation vs. registration remain intentionally separate (different real business shapes — registration also writes `registration_orders`/`registration_participants`), per the explicit instruction not to force unrelated flows into one abstraction for cosmetic reasons. |
| Manual registration / bulk import: donation+order+participant committed as one transaction, campaign aggregate updated as a **separate**, non-atomic statement after — a crash in between left a real paid donation permanently unreflected in the campaign total | HIGH | **Fixed — WP4.** |
| Manual registration / bulk import had zero idempotency protection (unlike manual donation, F4.1) | HIGH | **Fixed — WP5**, reusing the exact existing `client_submission_key` mechanism (no new column/constraint). |
| `console.log` of the LowProfile/Create payload redacted `ApiPassword` but not `ApiName` (also a credential per CardCom's own docs) | MEDIUM | **Fixed**, found and closed while implementing WP1. |
| Raw CardCom webhook payloads written unredacted to a log file with no retention, marked "TEMPORARY" since an investigation that closed long ago | MEDIUM | **Fixed — WP6** (removed). |
| Recurring webhook's shared `Secret` persisted in plaintext forever inside `cardcom_webhook_events.raw_payload` | MEDIUM | **Fixed — WP6** (stripped before hashing/storage/downstream dispatch). |
| No column distinguishes which CardCom terminal (entity's own vs. Hamonym's platform fallback) actually processed a given donation, and the platform fallback terminal is the same one now used for Hamonym's own fee Collection | MEDIUM (accounting), not a Donation Engine correctness issue | **Not fixed — explicitly out of scope.** Documented here as a follow-up requirement for Billing/accounting, per instruction, since it doesn't affect any Donation Engine invariant. |
| `markDonationFailed` never called; a Gate-held or not-paid-at-Cardcom donation just stays `pending` forever | — | **Explicitly deferred — business decision, not implemented.** Deciding when `pending → failed` is appropriate needs a business rule this session was told to stop on, not guess. |

## WP2 — recurring reconciliation, the important design decision

`GetRecurringPaymentHistory` (CardCom v11, verified against the official swagger, not guessed) gives an authoritative, webhook-independent list of actual billing attempts per recurring instruction (`TranzactionId`/`RowID`/`PaymentNum`/`CreateDate`/`SumToBill`/`Status`). The new job (`recurring-payment-reconciliation.job.js`) pulls a 40-day lookback per active instruction and finalizes any `SUCCESSFUL` entry with no local counterpart.

**The correlation problem was real, not assumed away.** The History API doesn't return `InternalDealNumber` (what the live webhook stores as `provider_reference`), and empirically **none** of the 3 real production recurring donations have `provider_row_id` populated, even though `RowID` does appear in one captured raw payload. There is no single confirmed-reliable shared identifier between the two Cardcom APIs. "Already represented locally" is therefore decided by the strongest available signal — `provider_row_id` match if both sides have it, else an existing **`paid`** donation on the same instruction/day/amount (deliberately not matching against `failed` attempts, since a real successful retry after a failed one is still a genuinely missing charge). Every recovery is also written to `reconciliation_findings` for visibility. Not a cryptographic guarantee — the best available correlation given what CardCom's real APIs actually expose, stated as such in the code and here, not overclaimed.

**Correction (2026-09-01, pre-push safety check):** the line above was wrong. A Render Cron Job (`cron-entry.js`, every 15 min) has been live in production since 2026-08-18 (`docs/CARDCOM_OPERATIONAL_PROCESSES.md` Part י"א) and automatically picks up every job in `src/jobs/index.js` that carries a `schedule` field — `stale-pending-donations` included, which predates this closure and was already in that rotation. This job would have entered the same rotation automatically on deploy, with no separate opt-in, and started auto-finalizing real donations from a day+amount heuristic on the next `03:00` window. Its `schedule` field was removed before shipping — see the Post-Launch Hardening Backlog below.

## Post-Launch Donation Hardening Backlog

Not release blockers — Donation Engine v1 ships without these. Listed here so they aren't rediscovered from scratch:

1. **Recurring reconciliation (WP2) stays dormant.** `recurring-payment-reconciliation.job.js` is fully implemented and tested (9 passing tests) but ships with no `schedule` field, so the live Render Cron (`cron-entry.js`) skips it — confirmed at the trigger-mechanism level (`cron-entry.js`/`scheduler.js` both `continue` before ever reaching `schedule-window.js` for a job with no `schedule`). Reason: its fallback match (when neither side has `provider_row_id`) is a day+amount heuristic against CardCom history, not an authoritative per-charge identifier — unlike WP3's repair path, which only finalizes after CardCom's own `GetLpResult` confirms success. Re-enable by restoring the `schedule` field once the correlation is strengthened (e.g. validating whether `TranzactionId` can reliably stand in for `provider_reference`/`InternalDealNumber` — see the conflicting claims between this doc and `CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md`/`CARDCOM_OPERATIONAL_PROCESSES.md` about whether that's already proven). Until then, run manually via `job-runner.run('recurring-payment-reconciliation')` or Admin "Run now", not automatically.
2. **DetailRecurring webhook forgeability** — accepted residual risk (see findings table above), no per-webhook CardCom verification call added.
3. **Terminal-provenance column** — no field distinguishes entity-owned vs. Hamonym-fallback CardCom terminal on a donation (accounting follow-up for Billing).
4. **`pending → failed` policy** — deliberately undecided business rule; stale `pending` donations that CardCom never actually charged stay `pending` forever today.
5. **Reward inventory** is check-then-insert, not a hard atomic reservation (WP1) — fine for current volume, not safe under real concurrent contention.

## Commits

**hamonym-backend / outer repo — pushed to `main` 2026-09-01:**
```
7cb35d2  WP1: server-side validation of donation amount and reward claims
062ab77  WP2: recurring payment reconciliation -- recover charges whose webhook was lost
7b13c05  WP3: stale-pending-donations upgraded from detect-only to detect-and-repair
4407194  WP4/WP5: atomic + idempotent manual registration and bulk import
                 (also contains WP6's payment.controller.js changes -- a staging
                 mistake bundled them together; functionally correct, just not
                 split as cleanly as the commit message implies)
d8d39f7  Add regression tests for detail-recurring.handler.js after WP2/WP4 refactor
25c18be  Record Donation Engine full audit + closure (2026-08-31)
94ef9e6  Keep recurring-payment-reconciliation dormant pending correlation validation
```

**hamonym-app — pushed to `main` 2026-09-01:**
```
efb5c1b  WP5: idempotency keys for manual registration + bulk import
cb77819  Merge remote-tracking branch 'origin/main'
```

## Tests

53 tests across 8 new/updated scripts (`scripts/test-*.js`), all passing, zero real CardCom calls, zero permanent test financial facts created. Where a scenario genuinely required a real committed `paid` donation to test end-to-end (the true concurrent-duplicate-request race hitting a UNIQUE constraint), it was accepted on the basis of mirroring an already-proven identical pattern (`createManualDonation`'s own concurrency handling) rather than independently re-verified live, since doing so would create exactly the irreversible test fact this whole effort avoided everywhere else. Stated explicitly, not silently assumed.

## Final verdict

**DONATION ENGINE v1: SHIPPED (2026-09-01).** Remaining items are explicitly accepted residual risk (recurring webhook forgeability, mitigated not eliminated), explicitly deferred business decisions (pending→failed policy), explicitly out-of-scope follow-ups (terminal-provenance column, MASAV, receipts/invoices to entities), or explicitly deferred pending validation (WP2 recurring reconciliation, shipped dormant) — see Post-Launch Donation Hardening Backlog above. None are blockers per the instructions this work was scoped against.

Next: resume Billing Engine operational-lifecycle work (see `docs/BILLING_ENGINE_SESSION_HANDOFF_2026-08-28.md`'s MILESTONE sections) — the audit that motivated pausing it is now closed.
