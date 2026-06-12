-- OAuth users have no password — make password_hash nullable
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Store Google profile picture URL
ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT;
