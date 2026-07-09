ALTER TABLE users
  ADD COLUMN IF NOT EXISTS platform_permissions TEXT[];
