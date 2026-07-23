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
 * @property {'free_text'|'website'|'combined'} source
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
 * @property {string|null} heroVideoUrl - Only filled when an explicit YouTube/Vimeo URL appears in the source AND the surrounding text signals it's meant to represent the campaign (not just any video link mentioned in passing). Same "never invent" discipline as socialLinks.
 * @property {string|null} contactEmail - Public contact found in the source, shown as supporting info only — never auto-written to a registration form's own "who's filling this out" fields. See MVP doc §5.
 * @property {string|null} contactPhone
 */

/**
 * @typedef {Object} SuggestedValue
 * A recommendation, not a decision (ADR decision 6 — AI never bypasses
 * business rules, it only proposes what a human still confirms). `value` is
 * null when there's no real basis to suggest one — Brief doesn't invent
 * facts/numbers any more than Extraction does (see brief.builder.js on
 * suggestedTargetAmount specifically); it only generates for genuinely
 * creative/organizational judgment calls, where "propose something
 * reasonable" is literally the job.
 * @property {*} value
 * @property {string} reason - One sentence, Hebrew, explaining the suggestion (or explaining why value is null).
 */

/**
 * @typedef {Object} Brief
 * Built by brief.builder.js from ExtractedFacts alone — never re-reads
 * sourceRaw (see ADR decision 5: Brief regeneration must be cheap, no
 * re-running Extraction). Two kinds of field:
 *  - Plain carry-overs from ExtractedFacts (organizationName, organizationNumber,
 *    organizationDescription, entityType, title, shortDescription) — nothing
 *    to reason about, Extraction already did that work in Sprint 1; kept as
 *    bare values, not wrapped in SuggestedValue. entityType specifically:
 *    unlike category, ExtractedFacts.entityTypeGuess is already a single
 *    guess, not a list to choose from — nothing for Brief to decide, so it
 *    stays a bare carry-over rather than a SuggestedValue.
 *  - Genuine Brief-level decisions (category, suggestedTargetAmount,
 *    suggestedTone, suggestedCtaLabel, suggestedHero) — wrapped in
 *    SuggestedValue because a human should be able to see *why*.
 * @property {string|null} organizationName
 * @property {string|null} organizationNumber - Always requires manual confirmation before commit regardless of confidence (MVP doc §5/§6) — Brief doesn't add a confidence signal here, just passes it through as-is.
 * @property {string|null} organizationDescription
 * @property {string|null} entityType - Carried over from ExtractedFacts.entityTypeGuess (added Sprint 3, found missing while mapping to OrganizationRegistrationState.entityType).
 * @property {string|null} title
 * @property {string|null} shortDescription
 * @property {string|null} heroVideoUrl - Plain carry-over from ExtractedFacts, not a SuggestedValue: either the user gave an explicit video URL or they didn't, nothing for Brief to judge/reason about.
 * @property {SuggestedValue} category - Picks ONE category from ExtractedFacts.categoryGuess (a decision), or {value: null, reason: '...'} if categoryGuess was empty.
 * @property {SuggestedValue} suggestedTargetAmount - {value: <amount>, reason: 'explicit in source'} when ExtractedFacts.suggestedTargetAmount was set; otherwise {value: null, reason: '...'} — never a guessed/benchmark figure.
 * @property {SuggestedValue} suggestedTone - Short mood/style description (e.g. "תקווה ואופטימיות"), not a specific frontend palette key — TEMPLATE_PALETTES mapping is frontend-owned, deferred to the Draft-mapping sprint.
 * @property {SuggestedValue} suggestedCtaLabel - Short button text, e.g. "תרמו עכשיו".
 * @property {SuggestedValue} suggestedHero - One sentence describing what the Hero section should emphasize visually/emotionally.
 * @property {SuggestedValue} story - A longer (~150-350 word) narrative paragraph for the campaign page's main body — creative expansion/rephrasing of organizationDescription/title/shortDescription (and OnlineResearch when provided), never new invented facts. {value: null, reason: '...'} when there isn't enough source material to expand from.
 * @property {Array<{title: string, url: string}>} researchSources - URLs actually cited by OpenAI's web_search tool when the user opted into online research (2026-07-23); [] when research wasn't requested or found nothing. Shown to the user for transparency, not consumed structurally.
 * @property {string[]} clarifyingQuestions - 2-5 short, specific questions the Brief LLM step generated when it judged the story would materially improve with operational details only the campaign manager would know (exact dates, headcounts, costs — the kind of thing no web search or Facts extraction can invent). [] when there was already enough to work with, or after a round of userAnswers was already incorporated (capped at one round). See campaign-creation.prompt.js rule 9.
 */

module.exports = {};
