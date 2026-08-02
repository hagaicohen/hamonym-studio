// BriefBuilder — turns ExtractedFacts into a Brief. See
// AI_CAMPAIGN_CREATION_MVP.md and campaign-creation.types.js's Brief typedef
// for the value/reason split. Sprint 2 goal: validate that the Facts→Brief
// contract holds — this only produces Brief JSON, no Draft mapping, no UI
// (see AI_CAMPAIGN_CREATION_VISION.md decision 3/5).

const llmService = require('../../llm.service');
const { getBriefSystemPrompt, buildBriefPrompt } = require('../campaign-creation.prompt');

function suggested(value, reason) {
  return { value: value ?? null, reason: reason || '' };
}

// Whitelists galleryCuration's hero/gallery/hidden codes against the labels
// this specific request actually sent (e.g. ["image1","image2"]) — same
// "don't trust the model, re-verify at the boundary" discipline as
// organizationNumber/heroVideoUrl. A hallucinated or stale label (e.g. from
// a previous round, or just made up) would otherwise silently break the
// frontend's index-based mapping back to real files.
function sanitizeGalleryCuration(raw, imageLabels) {
  if (!raw || !imageLabels?.length) return null;
  const known = new Set(imageLabels);
  const hero = known.has(raw.hero) ? raw.hero : null;
  const gallery = Array.isArray(raw.gallery) ? raw.gallery.filter((l) => known.has(l) && l !== hero) : [];
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((l) => known.has(l) && l !== hero && !gallery.includes(l)) : [];
  return { hero, gallery, hidden, reason: raw.reason || '' };
}

// Re-projects the raw LLM response onto the known Brief whitelist — same
// boundary discipline as free-text.extractor.js's project(). Plain
// carry-over fields come straight from `facts`, never from the model's
// output, so the model has no way to alter them even if it tried.
function project(facts, raw, imageLabels) {
  return {
    organizationName: facts.organizationName ?? null,
    organizationNumber: facts.organizationNumber ?? null,
    organizationDescription: facts.organizationDescription ?? null,
    entityType: facts.entityTypeGuess ?? null,
    title: facts.suggestedTitle ?? null,
    shortDescription: facts.suggestedShortDescription ?? null,
    heroVideoUrl: facts.heroVideoUrl ?? null,
    category: suggested(raw.category?.value, raw.category?.reason),
    suggestedTargetAmount: suggested(raw.suggestedTargetAmount?.value, raw.suggestedTargetAmount?.reason),
    suggestedTone: suggested(raw.suggestedTone?.value, raw.suggestedTone?.reason),
    suggestedCtaLabel: suggested(raw.suggestedCtaLabel?.value, raw.suggestedCtaLabel?.reason),
    suggestedHero: suggested(raw.suggestedHero?.value, raw.suggestedHero?.reason),
    story: suggested(raw.story?.value, raw.story?.reason),
    clarifyingQuestions: Array.isArray(raw.clarifyingQuestions) ? raw.clarifyingQuestions : [],
    designIntent: raw.designIntent && typeof raw.designIntent === 'object' ? {
      emotion: raw.designIntent.emotion || null,
      urgency: raw.designIntent.urgency || null,
      focus: raw.designIntent.focus || null,
      energy: raw.designIntent.energy || null,
    } : null,
    contentStrategy: raw.contentStrategy && typeof raw.contentStrategy === 'object' ? {
      primaryAudience: raw.contentStrategy.primaryAudience || null,
      storyPattern: raw.contentStrategy.storyPattern || null,
      ctaApproach: raw.contentStrategy.ctaApproach || null,
    } : null,
    galleryCuration: sanitizeGalleryCuration(raw.galleryCuration, imageLabels),
  };
}

// @param {import('../campaign-creation.types').ExtractedFacts} facts
// @param {{ text: string, sources: Array<{title: string, url: string}> } | null} [research] - optional, real internet research about the organization (2026-07-23)
// @param {Array<{question: string, answer: string}>} [userAnswers] - optional, campaign manager's own answers to a previous round's clarifyingQuestions (2026-07-23)
// @param {Array<{label: string, mimeType: string, buffer: Buffer}>} [images] - optional, uploaded images for galleryCuration (2026-07-23)
// @param {'campaign'|'partner'} [targetType] - which system prompt to use (2026-07-31) — same Brief shape either way, only the framing/rules differ (donation appeal vs. evergreen business profile). Defaults to 'campaign'.
// @returns {Promise<import('../campaign-creation.types').Brief>}
exports.build = async (facts, research, userAnswers, images, targetType) => {
  const userPrompt = buildBriefPrompt(facts, research, userAnswers, images);
  // temperature: 0 — same reasoning as free-text.extractor.js: this corpus
  // exists to be diffed across prompt changes, which only means something if
  // reruns are stable.
  const raw = await llmService.complete(getBriefSystemPrompt(targetType), userPrompt, { temperature: 0 });

  // suggestedTargetAmount carries a hard guarantee beyond what the prompt
  // asks for: if Facts had no explicit amount, the value is forced to null
  // here regardless of what the model returned — this is the one field
  // where "the model didn't listen" must never leak through, since it's the
  // exact kind of invented number the whole ADR was built to prevent (see
  // Sprint 1 fixture findings).
  const brief = project(facts, raw, images?.map((img) => img.label));
  if (facts.suggestedTargetAmount == null) {
    brief.suggestedTargetAmount = suggested(null, brief.suggestedTargetAmount.reason || 'לא צוין סכום יעד במקור — יש להזין ידנית.');
  }

  // Capped at one round on purpose — after the campaign manager already
  // answered a round of clarifyingQuestions, asking yet another round would
  // start to feel like an interrogation instead of a quick assist. If the
  // model still doesn't have enough after UserAnswers, better to write the
  // best story it can with an honest reason than to keep asking.
  if (userAnswers?.length) {
    brief.clarifyingQuestions = [];
  }

  // Carried straight through, never re-derived from the model's output —
  // these are the actual URLs OpenAI's web_search tool cited, not something
  // the LLM could alter. Shown to the user for transparency (which real
  // pages backed the generated story) even though nothing downstream
  // consumes them structurally yet.
  brief.researchSources = research?.sources || [];

  return brief;
};
