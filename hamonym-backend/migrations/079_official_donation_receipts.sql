BEGIN;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS donation_proof_version UUID,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS donation_verified_email TEXT,
  ADD COLUMN IF NOT EXISTS donation_verification_email TEXT,
  ADD COLUMN IF NOT EXISTS donation_verification_hash TEXT,
  ADD COLUMN IF NOT EXISTS donation_verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS donation_verification_sent_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS receipt_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id),
  provider_terminal TEXT NOT NULL,
  document_number BIGINT NOT NULL CHECK (document_number > 0),
  document_type TEXT NOT NULL,
  transaction_reference TEXT NOT NULL,
  document_status TEXT NOT NULL DEFAULT 'available'
    CHECK (document_status IN ('available', 'cancelled', 'replaced')),
  issued_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_terminal, document_type, document_number)
);
ALTER TABLE receipt_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS receipt_documents_receipt_idx ON receipt_documents(receipt_id);
-- Existing receipts, financial records and ownership assignments remain intact.
COMMIT;
