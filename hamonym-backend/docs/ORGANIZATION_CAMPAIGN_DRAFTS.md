# Organization review and campaign drafts

The pilot read-only investigation found two distinct non-deleted organizations
with the same display name: one abandoned draft and one pending application,
with different IDs and registration numbers. They are not duplicate rows from
a SQL join. The Admin Dashboard previously treated both draft registration and
submitted registration as review tasks. Drafts are now excluded from that task
list; pending applications and existing active-organization attention remain.
The Admin bell also counts pending and flagged review requests only; an
unsubmitted draft no longer appears as another actionable review notification.
No records, submissions or audit history are deleted or merged by name.

The local Backend changes are in the existing worktree:
`C:/DEV/HamonymStudio-fin11-masav-deploy/hamonym-backend`.
Do not apply them to the stale nested frontend backend copy.

Campaigns can already be created and edited before organization approval.
Creation now always persists a draft, ignoring a forged `status: published`.
The existing guarded update endpoint remains the publication path. Public
campaign lookup/discovery and donor checkout retain the active-organization
requirement. Rejection/suspension preserves existing campaigns without exposing
them publicly. This change does not add an editing restriction for those states.

Campaign lists explain draft visibility for draft, pending-review and
changes-requested organizations. The Dashboard also offers its existing wizard
link while corrections are requested. No campaign is created by navigation.
Existing selected-organization context and cancellation of stale list responses
are preserved. Automatic first-campaign guidance remains limited to ready,
approved organizations; other organizations use explicit navigation.

`publishRequestedCampaigns()` and Admin approval publication are unchanged.
The existing explicit organization submission fix remains idempotent for
already-pending applications and does not submit on save.

Verification uses disposable Docker PostgreSQL databases and mocked frontend
HTTP. Run `scripts/test-organization-campaign-drafts-postgres.cjs` with
`HAMONYM_ORG_LIFECYCLE_BACKEND` pointing to that worktree, plus the existing
lifecycle PostgreSQL runner and Angular organization lifecycle specs. Shared
pilot access was read-only; no financial provider or live job was invoked.
