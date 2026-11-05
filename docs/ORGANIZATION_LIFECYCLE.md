# Organization lifecycle — local implementation

Frontend: this repository. Updated backend worktree:
`C:/DEV/HamonymStudio-fin11-masav-deploy/hamonym-backend`.
The old nested `hamonym-backend` copy was not used as the implementation target.
No deployment, shared data changes, provider calls, or migrations are required by
the implementation or performed during verification.

## Requirements and transitions

- Save Draft persists data/files without changing approval status.
- Explicit submission validates the existing profile fields: entity type, legal
  name, registration number, display name, email, phone, description. Whitespace
  alone is not a value. Validation uses persisted fields on the backend.
- Selected uploads must succeed before the frontend calls `request-review`.
  Failures retain failed files for retry. Completed uploads are not repeated by
  the wizard. Submission/save clicks share an in-flight guard.
- `draft` and `changes_requested` may explicitly submit to `pending_review`.
  Repeated/concurrent submission to `pending_review` is idempotent.
- `pending_review` allows approve, reject, request changes.
- A rejected application is retained. Only a Super Admin can reopen it to
  `changes_requested`; the owner must then explicitly resubmit.
- Active organizations may suspend; suspended organizations may reactivate.
  Existing flagged-active reapproval remains supported.
- Backend row locks serialize decisions. Status updates and decision audit notes
  commit together; failed audit insertion rolls the decision back.
- Approval clears `requires_completion` and the existing reapproval flags.
  Optional documents and payment setup are not new approval gates. Stored
  missing-field details and historical audit notes are preserved.

## UI/context

Existing route-specific settings, shared status cards and one-use first-campaign
navigation remain. Settings cannot submit unsaved or failed file changes. Confirmed
review responses refresh the settings data and the matching active entity only.
Registration completion adds/updates its context without discarding other entities
or roles, then opens the dashboard.

Existing APIs emit organization-specific invalidation events after confirmed
submission/decisions. Feedback cards cancel stale loads and refresh on status/time
changes. Other organization cards refresh on events and every 20 seconds for
decisions made in another session. Notification responses cannot replace a newly
selected organization with the previous one.

## Campaign behavior preserved

Draft creation permissions, publication checks and CardCom selection are unchanged.
Initial approval still invokes `publishRequestedCampaigns` in its existing
transaction; only already-requested, eligible campaigns are considered by that
unchanged function. Reactivation does not invoke initial-approval publication.
Existing post-approval billing-account provisioning is unchanged.

## Verification

- Focused Angular suite: `tsconfig.organization-lifecycle.spec.json` covers wizard
  submission/uploads/retries, corrections/rejection, feedback, multi-entity
  settings, shared card styles and one-use navigation, plus existing login/header.
- PostgreSQL integration: set `HAMONYM_ORG_LIFECYCLE_BACKEND` to the updated backend
  worktree and run `node scripts/test-organization-lifecycle-postgres.cjs`.
  Requires the existing local Docker container `hamonym-test-db` and local `pg`
  dependency. The script creates and drops its own uniquely named database using
  fixture tables, without applying application migrations. External services are
  mocked; local Docker credentials are never printed.
- Angular production build: `npm run build -- --configuration production`.

The local frontend still points to Render by existing configuration. Full manual
testing of the new submission contract requires the updated backend to be run in
an appropriate local test environment; these changes have not been deployed.

## Organization switcher

- Header organization rows are keyboard-accessible buttons. Selection calls the
  existing ownership-protected entity GET before updating CurrentEntityService
  and CurrentContextService together. Draft, corrections and rejected statuses
  remain selectable; no status is changed by selection.
- A newer selection cancels the preceding request. Failed authorization retains
  the previous context and displays an error. Context synchronization also
  cancels obsolete entity loads; notification polling refreshes immediately on
  context changes and clears the preceding organization's notifications.
- Login installs the restored selected organization, rather than temporarily
  installing the first organization. The last explicit organization choice is
  stored as a per-user UI preference, survives logout without preserving tokens,
  and is used only if the fresh login membership list still authorizes it.
- Switching enters the existing Dashboard. Its existing readiness and one-use
  entry logic alone determine whether to offer the first campaign builder.
- Regression coverage: `core/services/organization-switcher.spec.ts`, existing
  Dashboard/route-specific settings tests and login/header tests. No database,
  financial logic or backend changes are required for this correction.
