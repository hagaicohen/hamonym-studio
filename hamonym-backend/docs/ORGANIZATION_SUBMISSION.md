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
