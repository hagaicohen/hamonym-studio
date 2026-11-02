-- Local preparation only. Shared application requires explicit migration approval.
-- Additive and nullable: existing rows stay NULL (intro not yet seen). Run before
-- deploying the first-campaign-intro endpoints.
ALTER TABLE public.user_entities
  ADD COLUMN IF NOT EXISTS first_campaign_intro_seen_at timestamptz;
