# 05 - Prioritized integration plan
> Inspection date: 2026-11-24. Evidence is local code and migration files, not a deployed-schema or runtime certification. No application/configuration/test changes, builds, test suites, API mutations, or database operations were performed.
>
> Source aliases: **F** = `C:/DEV/HamonymStudio/hamonym-app` (frontend/main checkout); **B** = `C:/DEV/HamonymStudio/hamonym-backend` (sibling backend in the parent repository); **L** = `F/hamonym-backend` (divergent nested backend). Do not combine these copies silently. B is the backend mapped below; deployment alignment remains a release prerequisite. Claude's conversion files are untouched.


All phases below are **PROPOSED / not implemented by this mapping**. Claude retains UI conversion ownership. This report creates documentation only.

| Phase | Scope and reuse | Dependencies | Completion criterion |
|---|---|---|---|
| 0. Align source and schema | Confirm F/B deployment pairing, preserve approved safe-save/bilingual foundation, obtain read-only schema/migration inventory | None | Agreed source revision and verified column/migration facts; no silent fallback to older nested backend |
| 1. Login and host context | Existing login/JWT/entity context and supplied bridge; draft-authoring permission fix only after separate approval | 0 | Authorized user/entity context arrives; server rejects unauthorized access; draft authoring and publish/payment gates remain distinct |
| 2. Server draft vertical slice | CampaignDraft adapter, existing POST/GET/PATCH; versioned presentation namespace, dirty patches, unknown-field preservation, async save queue/error states | 0–1 | Login → create draft → open Studio → edit → server save → close → reopen exact authored document, stable IDs and bilingual values; no payment/publish writes |
| 3. Media and concurrency | Existing upload service/API; materialize IndexedDB references; bounded payloads and atomic revision conflicts | 2, before declaring persistence durable | Saved media works outside original browser; failed uploads remain recoverable; concurrent edits cannot silently overwrite |
| 4. Shared public renderer | Reuse Angular presentation components, backend campaign/public module APIs; separate live-data view | 2–3 | Same authored content/design in preview/public, actual live data, desktop/mobile/languages; preview cannot initiate irreversible actions |
| 5. Publication lifecycle | Existing blockers/status APIs and organization-approval path; staged changes/public projection/promotion | 4 | Draft content stays private; only eligible approved content becomes public; both publication paths preserve isolation |
| 6. One-time donation | Existing checkout/OpenFields/Cardcom, rewards validation, webhook verification, paid status and receipts | 4–5 | Published eligible campaign → existing checkout → verified callback → authoritative status/totals; no duplicate payment implementation |
| 7. Deferred capabilities | Reuse ambassadors/comments/registration/recurring APIs only after contract mapping; matching/full races require separate gap resolution | 6 | Each enabled UI action has an actual authorized backend operation and correct pricing/lifecycle; no demo outcomes presented as real |

## Ownership and minimal change boundary
- **Claude/frontend conversion:** source-faithful visual UI, cart/editor interaction, stable IDs, device overrides, bilingual presentation and host adapter calls.
- **Integration Angular:** CampaignDraft serialization/load, async remote save/media bridge, API response handling and readonly live data projection. Reuse existing services; do not replace Claude components.
- **Backend:** scoped permission fix, bilingual create/missing-schema behavior, safe JSON patch/revision, draft/public projection and atomic promotion, feed contract/guard alignment.
- **DB:** no schema changes in this task. First confirm existing types/migrations; existing layout may hold presentation document. A durable revision/history schema is conditional on actual concurrency/history requirements, not a migration per visual setting.
- **Payments:** existing backend/provider remains owner. Do not alter terminals, Cardcom or recurring lifecycle during the draft slice.

## First recommended implementation only
Phase 0 prerequisites followed by the server-draft vertical slice (phases 1–2), without publication/payment or further UI redesign. Preserve local recovery; explicitly distinguish locally saved from accepted by server. Reuse existing business canonicalization; do not auto-transfer whole prototype management arrays.

## Acceptance evidence required later
These are completion criteria, **not commands run in this mapping**. Owners must subsequently demonstrate exact save/reopen, preservation of unknown fields, bilingual and device inheritance, safe conflict/error handling and permission separation. Public/payment phases additionally need authoritative callback-to-status-to-total evidence in an approved isolated environment. No runtime behavior is certified by this code-reading report.

## Remaining uncertainties
Actual deployed backend copy/revision; applied migration state and base campaigns DDL; environment payment isolation; source-v4.48 versus local conversion version differences. These are explicit release prerequisites, not reasons to rebuild existing business logic.

