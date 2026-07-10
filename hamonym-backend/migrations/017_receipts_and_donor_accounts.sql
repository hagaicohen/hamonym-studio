ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS donor_user_id BIGINT REFERENCES users(id);

CREATE TABLE IF NOT EXISTS receipts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number BIGSERIAL UNIQUE,
  donation_id    UUID NOT NULL REFERENCES donations(id),
  entity_id      UUID REFERENCES entities(id),
  campaign_id    UUID REFERENCES campaigns(id),
  amount         NUMERIC NOT NULL,
  donor_name     TEXT,
  donor_email    TEXT,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(donation_id)
);
