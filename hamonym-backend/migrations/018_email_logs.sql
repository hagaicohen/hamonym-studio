CREATE TABLE IF NOT EXISTS email_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email            TEXT NOT NULL,
  template            TEXT NOT NULL,
  subject             TEXT,
  status              TEXT NOT NULL, -- 'sent' | 'failed' | 'disabled' | 'stub'
  provider            TEXT,
  provider_message_id TEXT,
  error               TEXT,
  entity_id           UUID REFERENCES entities(id),
  campaign_id         UUID REFERENCES campaigns(id),
  donation_id         UUID REFERENCES donations(id),
  user_id             BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_logs_donation_id ON email_logs(donation_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_to_email ON email_logs(to_email);
