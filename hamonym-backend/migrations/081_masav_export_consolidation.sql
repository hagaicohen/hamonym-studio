-- Additive only: persistent future-export mode and immutable instruction allocations.
ALTER TABLE platform_billing_settings ADD COLUMN masav_consolidation_mode TEXT NOT NULL DEFAULT 'entity'
  CHECK (masav_consolidation_mode IN ('entity','period'));
CREATE TABLE masav_export_batches (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), consolidation_mode TEXT NOT NULL CHECK(consolidation_mode IN ('entity','period')),
 total_amount NUMERIC(12,2) NOT NULL CHECK(total_amount>0), created_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE masav_export_instructions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), batch_id UUID NOT NULL REFERENCES masav_export_batches(id),
 entity_id UUID NOT NULL REFERENCES entities(id), ordinal INTEGER NOT NULL CHECK(ordinal>0),
 total_amount NUMERIC(12,2) NOT NULL CHECK(total_amount>0), bank_snapshot JSONB NOT NULL,
 UNIQUE(batch_id,ordinal)
);
CREATE TABLE masav_export_components (
 instruction_id UUID NOT NULL REFERENCES masav_export_instructions(id), proposal_id UUID NOT NULL UNIQUE REFERENCES masav_collection_proposals(id),
 statement_id UUID NOT NULL REFERENCES statements(id), billing_period_id UUID NOT NULL REFERENCES billing_periods(id),
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0), PRIMARY KEY(instruction_id,proposal_id)
);
CREATE FUNCTION masav_export_block_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only: % forbidden',TG_TABLE_NAME,TG_OP; END; $$;
CREATE TRIGGER masav_export_batches_immutable BEFORE UPDATE OR DELETE ON masav_export_batches FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
CREATE TRIGGER masav_export_instructions_immutable BEFORE UPDATE OR DELETE ON masav_export_instructions FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
CREATE TRIGGER masav_export_components_immutable BEFORE UPDATE OR DELETE ON masav_export_components FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
ALTER TABLE masav_export_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE masav_export_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE masav_export_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON masav_export_batches,masav_export_instructions,masav_export_components FROM PUBLIC,anon,authenticated;

-- Deferred checks permit a batch/instruction to be inserted before its immutable components.
CREATE FUNCTION masav_export_validate_instruction() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT COALESCE(SUM(amount),0) FROM masav_export_components WHERE instruction_id=NEW.id) <> NEW.total_amount THEN
  RAISE EXCEPTION 'MASAV instruction allocation total mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM masav_export_components c JOIN masav_collection_proposals p ON p.id=c.proposal_id JOIN statements s ON s.id=c.statement_id JOIN billing_accounts ba ON ba.id=s.billing_account_id
  WHERE c.instruction_id=NEW.id AND (p.statement_id<>c.statement_id OR s.billing_period_id<>c.billing_period_id OR ba.entity_id<>NEW.entity_id OR p.entity_id<>NEW.entity_id OR p.proposed_amount<>c.amount)) THEN
  RAISE EXCEPTION 'MASAV instruction original debt linkage mismatch'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER masav_export_instruction_totals AFTER INSERT ON masav_export_instructions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION masav_export_validate_instruction();
CREATE FUNCTION masav_export_validate_batch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT COALESCE(SUM(total_amount),0) FROM masav_export_instructions WHERE batch_id=NEW.id) <> NEW.total_amount THEN
  RAISE EXCEPTION 'MASAV batch instruction total mismatch'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER masav_export_batch_totals AFTER INSERT ON masav_export_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION masav_export_validate_batch();
CREATE TABLE masav_collection_results (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), instruction_id UUID NOT NULL REFERENCES masav_export_instructions(id),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 3 AND 120), amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 confirmed_at TIMESTAMPTZ NOT NULL, recorded_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE masav_result_allocations (
 result_id UUID NOT NULL REFERENCES masav_collection_results(id), statement_id UUID NOT NULL REFERENCES statements(id),
 payment_id UUID NOT NULL UNIQUE REFERENCES payments(id), amount NUMERIC(12,2) NOT NULL CHECK(amount>0), PRIMARY KEY(result_id,statement_id)
);
CREATE TRIGGER masav_collection_results_immutable BEFORE UPDATE OR DELETE ON masav_collection_results FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
CREATE TRIGGER masav_result_allocations_immutable BEFORE UPDATE OR DELETE ON masav_result_allocations FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
ALTER TABLE masav_collection_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE masav_result_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON masav_collection_results,masav_result_allocations FROM PUBLIC,anon,authenticated;
CREATE FUNCTION masav_result_validate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT COALESCE(SUM(amount),0) FROM masav_result_allocations WHERE result_id=NEW.id) <> NEW.amount THEN
  RAISE EXCEPTION 'MASAV confirmed result allocation mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM masav_result_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.result_id=NEW.id AND (p.statement_id<>a.statement_id OR p.amount<>a.amount OR p.provider<>'masav')) THEN
  RAISE EXCEPTION 'MASAV confirmed result payment linkage mismatch'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER masav_result_totals AFTER INSERT ON masav_collection_results DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION masav_result_validate();
