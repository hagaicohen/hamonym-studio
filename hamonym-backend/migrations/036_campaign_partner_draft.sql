-- Phase 5 model refinement — "Partner Profile" vs "Campaign Participation".
-- See docs/PARTNER_DOMAIN_MODEL_ADR.md. Live inspection of the old
-- WordPress-era partner pages showed almost all of their content (offer,
-- coupon, campaign-specific images/story, "בשיתוף עם X") is tied to ONE
-- specific campaign, not to the business itself — a single shared Partner
-- page can't represent that without either losing the campaign-specific
-- promo entirely or re-introducing a copy-per-campaign model (rejected
-- earlier in this ADR).
--
-- Resolution: split into two layers, same JSONB-blocks pattern already used
-- twice (campaigns.blocks/layout, entities.blocks/layout — Phase 3). The
-- evergreen "Partner Profile" stays on entities (unchanged). This adds the
-- same pair directly on campaign_partners — the row that already
-- represents exactly one Partner's participation in exactly one campaign —
-- for the per-campaign "Campaign Participation" content (Campaign Hero,
-- offer/coupon box, campaign-specific story/images, CTA). The public page
-- composes both when a campaign context is known; Partner Profile alone
-- otherwise. See owner-registry.ts OwnerType 'campaign-partner'.
ALTER TABLE campaign_partners
  ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS layout JSONB NOT NULL DEFAULT '{}'::jsonb;
