-- Partner Invite (Phase 4 — Partner Management, Epic 3). See
-- docs/PARTNER_DOMAIN_MODEL_ADR.md §9/§10.
--
-- Mirrors the raw-token + SHA-256-hash pattern already used for password
-- reset / admin invites (platform.service.js#createAdminUser,
-- users.password_reset_token) rather than inventing a new token scheme.
-- Kept as its own small table (not a column on `users`, unlike password
-- reset) because a single user can be invited to MULTIPLE different
-- Partner entities concurrently — a single-slot column would collide.
CREATE TABLE IF NOT EXISTS partner_invites (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_id          UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  email              TEXT NOT NULL,
  token_hash         TEXT NOT NULL UNIQUE,

  invited_by_user_id BIGINT REFERENCES users(id),

  expires_at         TIMESTAMPTZ NOT NULL,
  accepted_at        TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_invites_entity ON partner_invites(entity_id);
