// Documentation only — this backend is plain JS/CommonJS with no
// TypeScript, so there's no compiler to enforce this. Mirrors the pattern
// established in src/agents/approval/approval.types.js and
// src/agents/campaign-advisor/campaign-advisor.types.js.
//
// Named ExtractedFacts, not CampaignFacts — campaign-advisor.types.js
// already defines its own CampaignFacts with a different meaning (existing
// campaign completeness, not source-material extraction). See
// AI_CAMPAIGN_CREATION_VISION.md decision 4/9.

/**
 * @typedef {Object} ExtractedFacts
 * Built by an Extractor (free-text.extractor.js, website.extractor.js — not
 * built yet) from raw source material the user supplied — objective
 * findings only, never a business decision (that's Brief's job, not built
 * yet either — see AI_CAMPAIGN_CREATION_MVP.md). Every value here is either
 * directly stated in the source or explicitly unknown (null/empty array) —
 * the LLM is instructed not to invent what it doesn't have.
 *
 * Deliberately excludes anything resembling bank/payment/credential fields
 * (ADR decision 7) — there is no field here for them to ever land in, even
 * if a source document mentioned one.
 * @property {'free_text'|'website'} source
 * @property {string} sourceRaw - The raw input, kept for regenerate/debug — never persisted to a Draft.
 * @property {string|null} organizationName
 * @property {string|null} organizationNumber - Only filled when an explicit number appears in the source; never guessed. See MVP doc §5/§6 — always requires manual confirmation regardless.
 * @property {string|null} entityTypeGuess
 * @property {string[]} categoryGuess
 * @property {string|null} organizationDescription
 * @property {string|null} suggestedTitle
 * @property {string|null} suggestedShortDescription
 * @property {number|null} suggestedTargetAmount - Only filled when an explicit amount appears in the source.
 * @property {string[]} socialLinks
 * @property {string|null} contactEmail - Public contact found in the source, shown as supporting info only — never auto-written to a registration form's own "who's filling this out" fields. See MVP doc §5.
 * @property {string|null} contactPhone
 */

module.exports = {};
