-- Additive request journal: exact file replay after a lost HTTP response.
-- Apply after 081 and 082; no changes to existing balances or instructions.
CREATE TABLE masav_export_requests (
 request_id UUID PRIMARY KEY,
 requested_by BIGINT NOT NULL REFERENCES users(id),
 expected_token TEXT NOT NULL CHECK(length(expected_token)=64),
 batch_id UUID NOT NULL UNIQUE REFERENCES masav_export_batches(id),
 file_bytes BYTEA NOT NULL CHECK(octet_length(file_bytes)>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER masav_export_requests_immutable BEFORE UPDATE OR DELETE ON masav_export_requests
 FOR EACH ROW EXECUTE FUNCTION masav_export_block_mutation();
ALTER TABLE masav_export_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON masav_export_requests FROM PUBLIC, anon, authenticated;
