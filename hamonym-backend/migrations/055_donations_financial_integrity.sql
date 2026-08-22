-- Financial Integrity Hardening (F3.1) — docs/HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md
-- context, but this migration is about the Charging Engine's own donations
-- table, not Billing itself: a paid donation is a financial fact from the
-- moment it becomes 'paid', independent of whether Billing has ever looked
-- at it. See the F3/F3.1 audit (2026-08-22) that motivated this.
--
-- NOT RUN YET — presented for review only.

-- ─────────────────────────────────────────────────────────
-- 1. A paid donation can never be physically deleted — directly, or via a
-- cascading DELETE from campaigns/entities. Deliberately a trigger on
-- donations itself, not a change to the existing entity_id/campaign_id
-- ON DELETE CASCADE — non-paid rows (pending/failed test data) must remain
-- freely cleanable when an entity is removed. Only 'paid' rows veto the
-- whole cascading delete, which fails the entire operation atomically
-- (BEGIN/COMMIT already wraps hardDeleteEntity — no code change needed
-- there for this to take effect).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION donations_block_paid_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    RAISE EXCEPTION 'donation % is paid and cannot be deleted (financial record)', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_donations_block_paid_delete
  BEFORE DELETE ON donations
  FOR EACH ROW EXECUTE FUNCTION donations_block_paid_delete();

-- ─────────────────────────────────────────────────────────
-- 2. Receipts are permanent financial documents (sequential receipt_number,
-- already issued to a donor) — no DELETE is ever legitimate, not just the
-- ones reachable via an unrelated cascade. This also blocks
-- hardDeleteEntity's own explicit `DELETE FROM receipts` step — that
-- function is intentionally NOT modified; it will now fail atomically
-- (ROLLBACK) for any entity/campaign with real receipts, which is exactly
-- the desired behavior, not a bug to work around.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION receipts_block_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'receipts are permanent financial documents and cannot be deleted (receipt %)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receipts_block_delete
  BEFORE DELETE ON receipts
  FOR EACH ROW EXECUTE FUNCTION receipts_block_delete();

-- ─────────────────────────────────────────────────────────
-- 3. DetailRecurring idempotency, made atomic at the DB level. The handler
-- already reasons about identity this way (`WHERE recurring_instruction_id
-- AND provider_reference` check-then-insert) — this constraint is the
-- backstop that check-then-insert can't provide under real concurrency.
-- No WHERE/partial clause needed: standard SQL UNIQUE semantics never
-- treat two NULLs as equal, so one-time donations (recurring_instruction_id
-- always NULL) are structurally exempt regardless of how many share a
-- provider_reference. Pre-flight (2026-08-22, live data): 0 existing
-- duplicates; provider_reference is proven NULL-impossible for any
-- DetailRecurring-created row (detail-recurring.handler.js:17 returns
-- before any INSERT if InternalDealNumber is missing) — this constraint
-- cannot silently fail to protect a legitimate row.
-- ─────────────────────────────────────────────────────────
ALTER TABLE donations
  ADD CONSTRAINT uq_donations_recurring_provider_ref
  UNIQUE (recurring_instruction_id, provider_reference);

-- ─────────────────────────────────────────────────────────
-- 4. Financial-fact immutability once paid. Scope is deliberately narrow —
-- only fields that represent "what happened, for how much, to whom" are
-- frozen. Donor contact metadata (name/email/phone/address/note/
-- is_anonymous), donor_user_id (account linking), rewards, and updated_at
-- are NOT covered — those are legitimately correctable operational facts,
-- not financial ones.
--
-- status: any change away from 'paid' is blocked entirely for now — no
-- refund/chargeback domain exists yet (F3 audit, 2026-08-22: zero
-- refund/chargeback semantics anywhere in the codebase). This trigger will
-- need a deliberate revision when that domain is designed — it is not
-- built to anticipate a specific future transition, per explicit
-- instruction not to invent 'refunded' now.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION donations_enforce_paid_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    IF NEW.amount              IS DISTINCT FROM OLD.amount
       OR NEW.entity_id        IS DISTINCT FROM OLD.entity_id
       OR NEW.campaign_id      IS DISTINCT FROM OLD.campaign_id
       OR NEW.is_mock          IS DISTINCT FROM OLD.is_mock
       OR NEW.completed_at     IS DISTINCT FROM OLD.completed_at
       OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
       OR NEW.low_profile_id   IS DISTINCT FROM OLD.low_profile_id
       OR NEW.status           IS DISTINCT FROM OLD.status
    THEN
      RAISE EXCEPTION 'donation % financial fields are frozen once paid', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_donations_enforce_paid_immutability
  BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION donations_enforce_paid_immutability();
