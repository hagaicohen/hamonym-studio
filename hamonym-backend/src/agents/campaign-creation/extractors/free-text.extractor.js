// FreeTextExtractor — turns raw free text into ExtractedFacts. See
// AI_CAMPAIGN_CREATION_MVP.md §2/§7. This is the cheapest Extractor (no
// scraping/parsing infra) — deliberately built and validated first, before
// the Website Extractor, which carries its own SSRF/failure surface (see
// AI_CAMPAIGN_CREATION_VISION.md §8) and is only worth building once
// ExtractedFacts quality from free text is proven.

const llmService = require('../../llm.service');
const { SYSTEM_PROMPT, buildExtractionPrompt } = require('../campaign-creation.prompt');

// Below this length there's nothing real to extract — skip the LLM call
// entirely rather than spend an API call on a couple of words. Lower than
// campaign-advisor.agent.js's MIN_STORY_TEXT_LENGTH (20) — that guard exists
// to skip title/description generation from a near-empty story block, but a
// short factual sentence here ("אנחנו עוזרים לנוער", 18 chars) is still
// worth sending to the LLM (found via fixtures/edge-sparse.txt — 20 silently
// skipped it entirely).
const MIN_TEXT_LENGTH = 10;

// Same "don't trust the model, re-verify at the boundary" discipline as
// organizationNumber — the prompt asks the model to only fill heroVideoUrl
// for youtube/vimeo links, but this is cheap to double-check in code rather
// than hoping the prompt was followed.
const VIDEO_URL_PATTERN = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)/i;

// Deterministic backstop for entityTypeGuess — found live (2026-07-23):
// even with an explicit prompt rule (SYSTEM_PROMPT rule 13), the model
// still sometimes missed an explicit "עמותת X" mention once it was buried
// inside a longer combined submission (free text + website + files all
// aggregated together, see document-collection.extractor.js) — plausibly
// an attention/priority issue with the extra volume, not a rule-following
// one. Rather than keep tuning prompt wording against non-determinism,
// this is a plain keyword scan over the same source text as a fallback:
// only used when the model returned null, and only for terms that are
// unambiguous enough to hardcode (a text saying "עמותת X" essentially
// never means anything else). Order matters — checked most-specific first
// so e.g. "עמותה... עוסק מורשה" doesn't accidentally match the wrong one.
const ENTITY_TYPE_KEYWORDS = [
  [/עוסק\s+פטור/, 'עוסק פטור'],
  [/עוסק\s+מורשה/, 'עוסק מורשה'],
  [/חל[״"]?ץ/, 'חל״ץ'],
  [/מפלגה/, 'מפלגה'],
  [/עמות(ה|ת)/, 'עמותה'],
];

function detectEntityTypeFallback(text) {
  for (const [pattern, value] of ENTITY_TYPE_KEYWORDS) {
    if (pattern.test(text)) return value;
  }
  return null;
}

function empty(text) {
  return {
    source: 'free_text',
    sourceRaw: text,
    organizationName: null,
    organizationNumber: null,
    entityTypeGuess: null,
    categoryGuess: [],
    organizationDescription: null,
    suggestedTitle: null,
    suggestedShortDescription: null,
    suggestedTargetAmount: null,
    socialLinks: [],
    heroVideoUrl: null,
    contactEmail: null,
    contactPhone: null,
  };
}

// Re-projects the raw LLM response onto the known ExtractedFacts whitelist —
// never passes the model's JSON through as-is. Mirrors the tools/*.tool.js
// pattern (e.g. approval/tools/entity.tool.js excluding cardcom_api_password)
// of shaping raw data before it leaves the boundary: a field the schema
// doesn't define — accidentally invented by the model, or anything
// resembling a sensitive field — can never reach a Brief or Draft this way,
// regardless of what the model actually returned.
function project(text, raw) {
  return {
    ...empty(text),
    organizationName: raw.organizationName ?? null,
    organizationNumber: raw.organizationNumber ?? null,
    entityTypeGuess: raw.entityTypeGuess ?? detectEntityTypeFallback(text),
    categoryGuess: Array.isArray(raw.categoryGuess) ? raw.categoryGuess : [],
    organizationDescription: raw.organizationDescription ?? null,
    suggestedTitle: raw.suggestedTitle ?? null,
    suggestedShortDescription: raw.suggestedShortDescription ?? null,
    suggestedTargetAmount: typeof raw.suggestedTargetAmount === 'number' ? raw.suggestedTargetAmount : null,
    socialLinks: Array.isArray(raw.socialLinks) ? raw.socialLinks : [],
    heroVideoUrl: typeof raw.heroVideoUrl === 'string' && VIDEO_URL_PATTERN.test(raw.heroVideoUrl) ? raw.heroVideoUrl : null,
    contactEmail: raw.contactEmail ?? null,
    contactPhone: raw.contactPhone ?? null,
  };
}

// Shared with document-collection.extractor.js — that extractor builds its
// own userPrompt (possibly a multi-modal content array with images, which
// plain free text never needs), but reuses this exact LLM-call +
// whitelist-projection logic rather than duplicating it. `sourceRaw` is
// whatever the caller wants recorded for debug/regenerate purposes — for
// document collections that's a text summary of what was submitted, not
// literal image bytes.
// @param {string} sourceRaw
// @param {string | Array<object>} userPromptContent
// @returns {Promise<import('../campaign-creation.types').ExtractedFacts>}
exports.runExtraction = async (sourceRaw, userPromptContent) => {
  // temperature: 0 — this is fact extraction, not advice/prose generation;
  // run-to-run consistency matters for the fixture corpus to mean anything
  // (see AI_CAMPAIGN_CREATION_MVP.md testing notes — found via a real
  // regression where re-running the same fixture gave different results).
  const raw = await llmService.complete(SYSTEM_PROMPT, userPromptContent, { temperature: 0 });
  return project(sourceRaw, raw);
};

exports.empty = empty;

// @param {string} text
// @returns {Promise<import('../campaign-creation.types').ExtractedFacts>}
exports.extract = async (text) => {
  if (!text || text.trim().length < MIN_TEXT_LENGTH) {
    return empty(text || '');
  }

  const userPrompt = buildExtractionPrompt(text);
  return exports.runExtraction(text, userPrompt);
};
