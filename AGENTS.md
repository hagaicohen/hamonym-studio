# HAMONYM — mandatory instructions for coding agents

## Current work scope

The user authorized Campaign Management Full V4 as one task. Use the approved HTML, implementation specification and coverage matrix for that scope. Separate authorization is required for work outside V4 and for changes to the Builder, vendor-v462, or the schema.

[HAMONYM_MASTER_PLAN.md](docs/HAMONYM_MASTER_PLAN.md) tracks tasks only. Existing project guidance still applies wherever it is consistent with these instructions.

## Working rules

- Read HAMONYM_MASTER_PLAN.md and the specific approved specification before editing. The master plan is a backlog, not permission to implement every item.
- Work only on the explicitly authorized task IDs and files needed for them. Do not expand scope, invent UI, refactor globally, or start another task. Report blockers and propose alternatives; stop at the task boundary, not at every intermediate step.
- Builder / Studio UI and vendor-v462 are frozen. Do not modify them without separate explicit approval. Preserve existing campaign engine and public renderer. Integration fixes outside the Builder must be narrow and evidence-based.
- Approved HTML is a binding specification, not inspiration. Draft prototypes are not approved. Reuse existing Angular components and styles/services where possible; pure Angular, no legacy DOM bridges or parallel mechanisms.
- Use existing authoritative business data and stable IDs. No full stale document overwrite for unrelated edits. Preserve unknown fields, visibility choices, financial history, permissions, and existing campaigns. No automatic reconciliation of ambiguous old values.
- No MOCK payment or collection mechanisms. Use real Cardcom with appropriate environment credentials and explicit safeguards. Never trigger duplicate charges/receipts or real charges through simulated time.
- No proactive DB backups. Non-destructive development migrations are allowed only within approved scope. Flag destructive/production changes for explicit approval. No commit, push or deploy without approval.
- No UI testing of any kind: no browser, screenshots, visual comparison, responsive visual tests or UI E2E. User performs UI acceptance. Compilation and targeted backend/API/schema/business-logic tests are permitted as relevant and authorized.
- Before reporting completion, compare source implementation against each approved requirement. Report task ID, requirements implemented/not implemented, changed files, tests actually run, outstanding risks and deviations. Do not claim acceptance or functional success based on compilation alone.
- Update only the relevant MASTER status to awaiting acceptance after implementation; only the user can approve closure. Keep reports compact. Do not introduce shipping/fulfillment, invitation/import workflows or new features deferred in MASTER.
