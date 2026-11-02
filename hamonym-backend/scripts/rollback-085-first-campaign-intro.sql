-- Roll back the first-campaign-intro code first; dropping the column discards seen states.
ALTER TABLE public.user_entities DROP COLUMN IF EXISTS first_campaign_intro_seen_at;
