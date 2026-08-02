// Shared type documentation + constants for the AI Website Import
// (partner-import) agent — see docs/DECISIONS.md 2026-07-31 and the plan
// this was built from. Classification-only: the LLM here never returns
// prose, only { sourceId, target, confidence } referencing content a
// deterministic extractor already pulled verbatim off a real page. See
// this module's INVARIANTS comment below before changing any shape here —
// it's the layer-boundary contract the whole feature depends on.
//
// INVARIANTS (do not break):
// 1. The LLM never returns new text — only sourceId/target/confidence.
// 2. Every value persisted traces back to a verbatim NormalizedBlock.
// 3. The frontend never holds NormalizedBlock[] — only a sessionId and,
//    after /classify, already-resolved {sourceId, target, confidence, value}.
// 4. A Target Resolver never constructs a CampaignBlock or references the
//    Builder's domain model.
// 5. Tiering (auto/review/suggestion) happens strictly after resolution.
// 6. The extractor is swappable without changing the Resolver contract.

// Bumped whenever lossless-dom.extractor.js's NormalizedBlock output shape
// changes — a cache row whose extractor_version doesn't match is treated
// as a miss and re-extracted, so a shape change can never silently hand
// old-shaped blocks to a resolver built for the new shape.
exports.EXTRACTOR_VERSION = '2';

// @typedef {Object} NormalizedBlock
// @property {string} id - stable within one extraction, e.g. "p12"/"img3"/"h2_1"
// @property {'heading'|'paragraph'|'image'|'list'|'link'} type
// @property {number} order - document order, the only ordering signal trusted downstream
// @property {number} [level] - heading level 1-6
// @property {string} [text] - verbatim text (paragraph/heading/list/link label)
// @property {string} [src] - absolute image URL
// @property {string} [alt]
// @property {number} [width]
// @property {number} [height]
// @property {string} [href] - absolute link URL

// @typedef {Object} ResolvedEntry
// @property {string} sourceId
// @property {string} target
// @property {number} confidence - 0-1
// @property {string} value - verbatim text or URL, looked up server-side by sourceId
// @property {'heading'|'paragraph'|'image'|'list'|'link'} sourceType - the originating NormalizedBlock's type,
//   so the mapper never has to guess "is this value text or a URL" from its shape

// Confidence tiers — duplicated as plain constants in the frontend mapper
// (two numbers, not worth a shared package).
exports.CONFIDENCE_HIGH = 0.75;
exports.CONFIDENCE_MEDIUM = 0.45;

// Legal `target` values per pass — a Target Resolver's whitelist boundary.
// Enforced by resolution.validator.js, never trusted from raw LLM output.
exports.PROFILE_TARGETS = ['about', 'gallery', 'hours', 'address'];
exports.PARTICIPATION_TARGETS = ['coupon', 'campaignStory', 'campaignHero', 'cta', 'campaignImage'];
