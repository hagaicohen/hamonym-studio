// BriefBuilder — turns ExtractedFacts into a Brief. See
// AI_CAMPAIGN_CREATION_MVP.md and campaign-creation.types.js's Brief typedef
// for the value/reason split. Sprint 2 goal: validate that the Facts→Brief
// contract holds — this only produces Brief JSON, no Draft mapping, no UI
// (see AI_CAMPAIGN_CREATION_VISION.md decision 3/5).

const llmService = require('../../llm.service');
const { BRIEF_SYSTEM_PROMPT, buildBriefPrompt } = require('../campaign-creation.prompt');

function suggested(value, reason) {
  return { value: value ?? null, reason: reason || '' };
}

// Re-projects the raw LLM response onto the known Brief whitelist — same
// boundary discipline as free-text.extractor.js's project(). Plain
// carry-over fields come straight from `facts`, never from the model's
// output, so the model has no way to alter them even if it tried.
function project(facts, raw) {
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
  };
}

// @param {import('../campaign-creation.types').ExtractedFacts} facts
// @param {{ text: string, sources: Array<{title: string, url: string}> } | null} [research] - optional, real internet research about the organization (2026-07-23)
// @returns {Promise<import('../campaign-creation.types').Brief>}
exports.build = async (facts, research) => {
  const userPrompt = buildBriefPrompt(facts, research);
  // temperature: 0 — same reasoning as free-text.extractor.js: this corpus
  // exists to be diffed across prompt changes, which only means something if
  // reruns are stable.
  const raw = await llmService.complete(BRIEF_SYSTEM_PROMPT, userPrompt, { temperature: 0 });

  // suggestedTargetAmount carries a hard guarantee beyond what the prompt
  // asks for: if Facts had no explicit amount, the value is forced to null
  // here regardless of what the model returned — this is the one field
  // where "the model didn't listen" must never leak through, since it's the
  // exact kind of invented number the whole ADR was built to prevent (see
  // Sprint 1 fixture findings).
  const brief = project(facts, raw);
  if (facts.suggestedTargetAmount == null) {
    brief.suggestedTargetAmount = suggested(null, brief.suggestedTargetAmount.reason || 'לא צוין סכום יעד במקור — יש להזין ידנית.');
  }

  // Carried straight through, never re-derived from the model's output —
  // these are the actual URLs OpenAI's web_search tool cited, not something
  // the LLM could alter. Shown to the user for transparency (which real
  // pages backed the generated story) even though nothing downstream
  // consumes them structurally yet.
  brief.researchSources = research?.sources || [];

  return brief;
};
