-- Platform Admin: one system-wide VAT rate (2026-09-14i product decision).
--
-- Until now, vat_rate lived per-billing_account (migration 054), set once
-- by the operator at account-creation time with no way to change it
-- afterward for an existing account (no UPDATE billing_accounts path ever
-- existed in the backend). Business decision: Hamonym charges the same VAT
-- rate to every association, and that rate must be changeable by Platform
-- Admin in exactly one place. Fee rate is NOT affected by this migration --
-- it remains a per-association commercial term on billing_accounts.fee_rate,
-- set once at provisioning, same as before.
--
-- Single-row settings table (id is always 1) rather than a generic
-- key/value settings registry -- there is exactly one platform-wide billing
-- setting today and no product decision yet to generalize this into a
-- registry; the smallest change that establishes one authoritative source.
--
-- calculation.service.js#calculateAccountStatement reads this row (via
-- platform-billing-settings.service.js#getCurrentVatRate) at
-- Statement-calculation time, in place of the old account.vat_rate read.
-- The value it reads is then copied into statements.vat_rate and frozen
-- forever by the pre-existing trg_statements_enforce_immutability trigger
-- (migration 054) -- this migration adds no new immutability logic, it only
-- changes where the calculation function sources vat_rate from. A rate
-- change here therefore only ever affects Statements calculated after the
-- change; every already-calculated Statement keeps its own frozen snapshot.
--
-- billing_accounts.vat_rate is left in place (NOT NULL, no schema change)
-- for compatibility -- new accounts still get a value written to it (copied
-- from this table at creation time, see provisioning.service.js), but it is
-- no longer read by calculation and no longer an operator-editable input.
CREATE TABLE IF NOT EXISTS platform_billing_settings (
  id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vat_rate   NUMERIC(6,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES users(id)
);

INSERT INTO platform_billing_settings (id, vat_rate)
VALUES (1, 0.18)
ON CONFLICT (id) DO NOTHING;
