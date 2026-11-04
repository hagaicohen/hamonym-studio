# Explicit organization submission

Organization creation and saving retain the existing status; a complete new
organization starts as `draft`. Profile completeness is computed on the server
from the existing required fields, without adding document or payment gates.

`PATCH /api/entities/:id/request-review` checks membership and locks the entity
row in a transaction. Drafts and corrections requested can be submitted;
already pending applications return the same state successfully. Rejected,
active and suspended applications cannot be submitted by their owner.
Existing pending applications do not require a data repair.

No migration, financial operation or change to Admin decisions is included.

Run `node scripts/test-organization-submission-postgres.cjs` from this backend
with dependencies installed and the existing local `hamonym-test-db` Docker
container running. The test creates and drops a disposable database on that
container only; it never uses the shared application database configuration.

The identity-aware version also requires migration 084. Its isolated regression
runner applies 084 only to the disposable local test database.

## Registration draft deletion (2026-11-04)

`DELETE /api/entities/:id/draft-registration` (requireAuth) discards an
unsubmitted registration draft. It is separate from the generic
`DELETE /api/entities/:id` and refuses:

- a user other than `created_by_user_id` (403 `NOT_DRAFT_CREATOR`; members too),
- any status other than `draft` (409 `NOT_A_DRAFT`),
- an entity with any campaign row, including deleted ones (409 `DRAFT_HAS_CAMPAIGNS`),
- partner entities, unknown or already-deleted ids (404 `DRAFT_NOT_FOUND`).

It is a soft delete of the `entities` row only (`deleted_at`, `deleted_by`,
`status = 'deleted'`), under `SELECT ... FOR UPDATE`. Documents, members,
roles and billing rows are not touched. No migration.

The registration screen lists every draft (newest first) with resume by id,
a delete icon behind a confirmation dialog, and "התחלת הרשמה חדשה".

Test: `scripts/test-registration-draft-delete-postgres.cjs` (disposable
database on `hamonym-test-db` only).
