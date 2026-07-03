-- 011_mock_donations.sql
-- Support for mock payment provider (dev/testing only)

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS is_mock        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failure_reason text;
