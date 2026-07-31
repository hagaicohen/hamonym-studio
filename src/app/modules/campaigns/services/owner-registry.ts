import { BlockType, CampaignDraft } from './campaign-studio-state.service';

// Phase 3 — Generic Page Builder Ownership Model. See
// docs/PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md. Everything in this file is the
// ONLY place that is allowed to know "what an OwnerType is" — the Builder,
// Renderer and state service consult these registries and never branch on
// ownerType directly. Adding a third OwnerType is meant to be a change to
// this file alone (new registry rows), not to callers.

// 'campaign-partner' — Phase 5 model refinement (2026-07-30, see
// docs/PARTNER_DOMAIN_MODEL_ADR.md). Live inspection of a real business
// partner page showed almost all of its content (offer, coupon,
// campaign-specific story/images, "בשיתוף עם X") is tied to ONE campaign,
// not to the business itself. A single shared Partner page can't represent
// that without either losing the campaign-specific promo or re-introducing
// a copy-per-campaign model (rejected earlier in this ADR). Resolution:
// split into two layers — 'partner' stays the evergreen Partner Profile
// (About/Gallery/Location/Hours/Website), 'campaign-partner' is the
// per-campaign "Campaign Participation" content (Campaign Hero, offer/
// coupon, campaign-specific story/images, CTA) — scoped to one
// campaign_partners row, not the entity. The public Partner page composes
// both when a campaign context is known (see partner-public-page.component).
export type OwnerType = 'campaign' | 'partner' | 'campaign-partner';

// ── Section Registry ───────────────────────────────────────────────────────
// Which BlockTypes are usable for which OwnerType. Rule (locked 2026-07-30):
// a block type that represents campaign-specific promotional content
// (coupons) belongs to exactly 'campaign-partner', never also 'partner' —
// otherwise nobody could predict where to go edit it. 'hero' is
// deliberately shared across all three (it's a generic "big banner" block
// shape reused with different intent/labels per owner — see blockLabels in
// campaign-page-builder-step.component.ts: "Partner Cover" for partner,
// "Campaign Hero" for campaign-partner — not the same ambiguity problem
// since each owner has its own separate blocks/layout storage).
export const SECTION_REGISTRY: Record<BlockType, OwnerType[]> = {
  'rich-text':       ['campaign', 'partner', 'campaign-partner'],
  'image':           ['campaign', 'partner', 'campaign-partner'],
  'video':           ['campaign', 'partner', 'campaign-partner'],
  'gallery':         ['campaign', 'partner', 'campaign-partner'],
  'split':           ['campaign', 'partner', 'campaign-partner'],
  'cta':             ['campaign', 'partner', 'campaign-partner'],
  'divider':         ['campaign', 'partner', 'campaign-partner'],
  'container':       ['campaign', 'partner', 'campaign-partner'],
  'stats':           ['campaign'],
  'donation-widget': ['campaign'],
  'hero':            ['campaign', 'partner', 'campaign-partner'],
  'tabs':            ['campaign', 'partner', 'campaign-partner'],
  'accordion':       ['campaign', 'partner', 'campaign-partner'],
  'rewards':         ['campaign'],
  'sponsors':        ['campaign'],
  'ambassadors':     ['campaign'],
  'donors':          ['campaign'],
  'updates':         ['campaign'],
  'share':           ['campaign', 'partner', 'campaign-partner'],
  'comments':        ['campaign'],
  'coupons':         ['campaign-partner'],
  'map':             ['partner'],
  'opening-hours':   ['partner'],
};

export function isSectionAvailableFor(type: BlockType, owner: OwnerType): boolean {
  return SECTION_REGISTRY[type]?.includes(owner) ?? false;
}

export function sectionsAvailableFor(owner: OwnerType): BlockType[] {
  return (Object.keys(SECTION_REGISTRY) as BlockType[]).filter(t => isSectionAvailableFor(t, owner));
}

// ── Owner Capability Registry ──────────────────────────────────────────────
// General "what is this Owner allowed to do" questions that aren't about a
// specific Section. Add a field here (not an `if (ownerType)` at the call
// site) whenever the Builder needs to ask something new about the Owner.
export interface OwnerCapabilities {
  canPublish:      boolean;
  hasGoal:         boolean;
  hasDonations:    boolean;
  hasRewards:      boolean;
  supportsCoupons: boolean;
}

export const OWNER_CAPABILITIES: Record<OwnerType, OwnerCapabilities> = {
  campaign:          { canPublish: true, hasGoal: true,  hasDonations: true,  hasRewards: true,  supportsCoupons: false },
  partner:           { canPublish: true, hasGoal: false, hasDonations: false, hasRewards: false, supportsCoupons: false },
  'campaign-partner': { canPublish: true, hasGoal: false, hasDonations: false, hasRewards: false, supportsCoupons: true },
};

export function capabilitiesFor(owner: OwnerType): OwnerCapabilities {
  return OWNER_CAPABILITIES[owner];
}

// ── Validation Registry ─────────────────────────────────────────────────────
// Extension point, not a migration of existing behavior — there is no
// pre-publish validation for campaigns today (grepped for
// validate/canPublish/isPublishable across the studio services, found
// nothing), so CampaignValidator below is an honest no-op, not invented
// rules. Its purpose is only to make sure that WHEN publish validation is
// added later (for either owner type), it lands here instead of as a
// scattered `if (ownerType === 'campaign')`.
export interface OwnerValidator {
  validateForPublish(draft: CampaignDraft): string[]; // empty = valid
}

const CampaignValidator: OwnerValidator = {
  validateForPublish: () => [],
};

const PartnerValidator: OwnerValidator = {
  validateForPublish: () => [],
};

const CampaignPartnerValidator: OwnerValidator = {
  validateForPublish: () => [],
};

export const OWNER_VALIDATORS: Record<OwnerType, OwnerValidator> = {
  campaign:           CampaignValidator,
  partner:            PartnerValidator,
  'campaign-partner': CampaignPartnerValidator,
};

export function validatorFor(owner: OwnerType): OwnerValidator {
  return OWNER_VALIDATORS[owner];
}
