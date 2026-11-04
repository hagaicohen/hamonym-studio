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

## Incomplete registrations are not organizations (2026-11-04)

This supersedes the paragraph above for status `draft` only.

- `entities.status = 'draft'` means the registration is incomplete. Such an
  entity cannot have campaigns, not even campaign drafts.
  `campaigns.service#createCampaign` refuses it with 409
  `ORGANIZATION_REGISTRATION_INCOMPLETE` after the membership check. Creating
  and editing campaign drafts starts once the registration is submitted
  (`pending_review` and later statuses). Publication and donations keep their
  existing approval and activation checks.
- Frontend (`core/utils/organization-registration-status.ts`):
  - Drafts are never selectable contexts. `initFromLogin` filters them, and
    `addEntityContext` ignores them.
  - The dashboard's other-organization list and "הארגונים שלי" show drafts only
    in the compact `app-incomplete-registrations` section ("רישומים שלא הושלמו").
  - Each draft links to `/organization-registration?draft=<id>`, which loads
    that draft by id, with the wizard's save/switch protections.
  - Login and the welcome guard send a user who has only drafts to the wizard.
- AI creation: the "new organization + campaign" mode was removed. "New
  organization" saves a registration draft and opens it in the wizard by id.
- The database was clean at this change, so there is no legacy handling.
- Tests:
  - Backend: `scripts/test-organization-campaign-drafts-postgres.cjs`, run
    against a disposable database.
  - Frontend: `organization-registration-status.spec.ts`,
    `welcome.guard.spec.ts`, `other-organizations.component.spec.ts` and
    `registration-drafts.spec.ts`.
