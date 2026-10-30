-- Local follow-up to 081: immutable final outcomes and explicit retry lineage.
CREATE TABLE masav_instruction_finalizations (
 instruction_id UUID PRIMARY KEY REFERENCES masav_export_instructions(id),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 3 AND 120),
 outcome TEXT NOT NULL CHECK(outcome IN ('partial','failed','completed')),
 collected_amount NUMERIC(12,2) NOT NULL CHECK(collected_amount>=0),
 original_remaining NUMERIC(12,2) NOT NULL CHECK(original_remaining>=0),
 confirmed_at TIMESTAMPTZ NOT NULL, recorded_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE masav_retry_requests (
 instruction_id UUID PRIMARY KEY REFERENCES masav_instruction_finalizations(instruction_id),
 requested_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE masav_retry_proposals (
 proposal_id UUID PRIMARY KEY REFERENCES masav_collection_proposals(id),
 original_instruction_id UUID NOT NULL REFERENCES masav_retry_requests(instruction_id),
 statement_id UUID NOT NULL REFERENCES statements(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER masav_instruction_finalizations_immutable BEFORE UPDATE OR DELETE ON masav_instruction_finalizations FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
CREATE TRIGGER masav_retry_requests_immutable BEFORE UPDATE OR DELETE ON masav_retry_requests FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
CREATE TRIGGER masav_retry_proposals_immutable BEFORE UPDATE OR DELETE ON masav_retry_proposals FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
ALTER TABLE masav_instruction_finalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE masav_retry_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE masav_retry_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON masav_instruction_finalizations,masav_retry_requests,masav_retry_proposals FROM PUBLIC,anon,authenticated;

CREATE FUNCTION masav_validate_finalization() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE original NUMERIC; collected NUMERIC;
BEGIN
 PERFORM 1 FROM masav_export_instructions WHERE id=NEW.instruction_id FOR UPDATE;
 SELECT total_amount INTO original FROM masav_export_instructions WHERE id=NEW.instruction_id;
 SELECT COALESCE(SUM(amount),0) INTO collected FROM masav_collection_results WHERE instruction_id=NEW.instruction_id;
 IF NEW.collected_amount<>collected OR collected>original OR NEW.original_remaining<>original-collected OR
 NEW.outcome<>(CASE WHEN collected=original THEN 'completed' WHEN collected=0 THEN 'failed' ELSE 'partial' END) THEN
  RAISE EXCEPTION 'MASAV finalization does not match confirmed results';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER masav_validate_finalization BEFORE INSERT ON masav_instruction_finalizations FOR EACH ROW EXECUTE FUNCTION masav_validate_finalization();
CREATE FUNCTION masav_reject_finalized_result() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM masav_export_instructions WHERE id=NEW.instruction_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM masav_instruction_finalizations WHERE instruction_id=NEW.instruction_id) THEN
  RAISE EXCEPTION 'MASAV instruction is finalized';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER masav_reject_finalized_result BEFORE INSERT ON masav_collection_results FOR EACH ROW EXECUTE FUNCTION masav_reject_finalized_result();
CREATE FUNCTION masav_validate_retry_link() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM masav_collection_proposals p JOIN masav_export_components c ON c.statement_id=p.statement_id
  JOIN masav_export_instructions i ON i.id=c.instruction_id JOIN masav_instruction_finalizations f ON f.instruction_id=i.id
  WHERE p.id=NEW.proposal_id AND p.statement_id=NEW.statement_id AND c.instruction_id=NEW.original_instruction_id
   AND p.entity_id=i.entity_id AND f.outcome IN ('partial','failed')) THEN
  RAISE EXCEPTION 'MASAV retry original debt linkage mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER masav_validate_retry_link BEFORE INSERT ON masav_retry_proposals FOR EACH ROW EXECUTE FUNCTION masav_validate_retry_link();
