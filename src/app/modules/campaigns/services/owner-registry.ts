import { BlockType, CampaignDraft } from './campaign-studio-state.service';

// Phase 3 — Generic Page Builder Ownership Model. See
// docs/PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md. Everything in this file is the
// ONLY place that is allowed to know "what an OwnerType is" — the Builder,
// Renderer and state service consult these registries and never branch on
// ownerType directly. Adding a third OwnerType is meant to be a change to
// this file alone (new registry rows), not to callers.

export type OwnerType = 'campaign' | 'partner';

// ── Section Registry ───────────────────────────────────────────────────────
// Which BlockTypes are usable for which OwnerType. Every existing BlockType
// keeps 'campaign' so today's campaigns are unaffected; only the three new
// Partner-only types (coupons/map/opening-hours) omit it.
export const SECTION_REGISTRY: Record<BlockType, OwnerType[]> = {
  'rich-text':       ['campaign', 'partner'],
  'image':           ['campaign', 'partner'],
  'video':           ['campaign', 'partner'],
  'gallery':         ['campaign', 'partner'],
  'split':           ['campaign', 'partner'],
  'cta':             ['campaign', 'partner'],
  'divider':         ['campaign', 'partner'],
  'container':       ['campaign', 'partner'],
  'stats':           ['campaign'],
  'donation-widget': ['campaign'],
  'hero':            ['campaign', 'partner'],
  'tabs':            ['campaign', 'partner'],
  'accordion':       ['campaign', 'partner'],
  'rewards':         ['campaign'],
  'sponsors':        ['campaign'],
  'ambassadors':     ['campaign'],
  'donors':          ['campaign'],
  'updates':         ['campaign'],
  'share':           ['campaign', 'partner'],
  'comments':        ['campaign'],
  'coupons':         ['partner'],
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
  campaign: { canPublish: true, hasGoal: true,  hasDonations: true,  hasRewards: true,  supportsCoupons: false },
  partner:  { canPublish: true, hasGoal: false, hasDonations: false, hasRewards: false, supportsCoupons: true  },
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

export const OWNER_VALIDATORS: Record<OwnerType, OwnerValidator> = {
  campaign: CampaignValidator,
  partner:  PartnerValidator,
};

export function validatorFor(owner: OwnerType): OwnerValidator {
  return OWNER_VALIDATORS[owner];
}
