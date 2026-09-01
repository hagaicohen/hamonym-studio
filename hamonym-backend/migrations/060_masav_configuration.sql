-- MASAV structured banking configuration + explicit authorization
-- (Billing v1 Bundle 2, 2026-09-01).
-- docs/HAMONYM_BILLING_ENGINE_SPEC.md's MASAV section (הרשאה לחיוב חשבון) +
-- docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md section 7, which
-- flagged that no structured bank-account data model existed anywhere.
--
-- Deliberately NOT inferred from entities.billing_masav_file_name (a
-- legacy uploaded-filename-only column, left untouched here), from the
-- mere presence of bank fields, from billing_accounts.preferred_collection_
-- method, or from any historical data -- authorization is its own explicit
-- boolean, flipped only by a dedicated Super Admin action.
--
-- One row per entity (not per billing_account) -- the banking relationship
-- belongs to the entity itself, matching where entities.billing_method
-- historically lived, and independent of billing_accounts' own lifecycle.

CREATE TABLE IF NOT EXISTS entity_masav_details (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL UNIQUE REFERENCES entities(id),
  bank_code           VARCHAR(10) NOT NULL,
  branch_code         VARCHAR(10) NOT NULL,
  account_number      VARCHAR(30) NOT NULL,
  account_holder_name TEXT,
  authorized          BOOLEAN NOT NULL DEFAULT false,
  authorized_by       BIGINT REFERENCES users(id),
  authorized_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- authorized_by/authorized_at only make sense together with authorized=true
-- -- enforced at the DB level so a stray UPDATE can never leave a half-set
-- authorization record that a later read could mistake for "was authorized
-- at some point". The service layer (masav-config.service.js) always
-- writes both together in both directions (authorize sets all three,
-- revoke clears all three), this CHECK is the belt-and-suspenders backstop.
ALTER TABLE entity_masav_details
  ADD CONSTRAINT entity_masav_details_authorization_consistent
  CHECK (
    (authorized = true  AND authorized_by IS NOT NULL AND authorized_at IS NOT NULL)
    OR
    (authorized = false AND authorized_by IS NULL AND authorized_at IS NULL)
  );
