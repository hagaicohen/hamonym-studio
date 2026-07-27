-- The retroactive guest-donation-linking query (runs on every login/register)
-- filters on LOWER(donor_email) with no supporting index — a full table scan
-- on every auth request. Table is tiny today, but this runs unconditionally
-- on every login so it should scale.
CREATE INDEX IF NOT EXISTS idx_donations_donor_email_lower ON donations (LOWER(donor_email));
