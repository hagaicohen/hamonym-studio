// CampaignCreationPipeline — entry point for AI-Assisted Campaign Creation.
// Named .pipeline.js, not .agent.js: it constructs new draft state from
// external input rather than judging something that already exists (unlike
// ApprovalAgent/CampaignAdvisorAgent) — see AI_CAMPAIGN_CREATION_VISION.md
// decision 11 and hamonym-backend/CLAUDE.md's "AI / LLM Capabilities"
// section. Same folder convention, same shared llm.service.js/trace.util.js
// as the existing agents.
//
// v1 scope: Extraction only (Input → ExtractedFacts). Brief generation and
// Draft creation aren't built yet — see AI_CAMPAIGN_CREATION_MVP.md. The
// immediate goal is validating that ExtractedFacts quality from free text is
// good enough to build a Brief on top of, without revisiting the Extractor.

const freeTextExtractor = require('./extractors/free-text.extractor');
const briefBuilder = require('./builders/brief.builder');
const draftBuilder = require('./builders/draft.builder');
const { createTracer } = require('../trace.util');

// @param {string} text
// @returns {Promise<import('./campaign-creation.types').ExtractedFacts & { trace: object[] }>}
exports.extractFromFreeText = async (text) => {
  const tracer = createTracer('CampaignCreationPipeline.extractFromFreeText');

  const facts = await tracer.trace('FreeTextExtractor', () => freeTextExtractor.extract(text),
    (f) => ({ hasOrgName: !!f.organizationName, hasTitle: !!f.suggestedTitle }));

  tracer.print();
  return { ...facts, trace: tracer.steps };
};

// Sprint 2 — validates the Facts→Brief contract in isolation. Takes
// ExtractedFacts directly (not text) so it can be tested/regenerated without
// touching Extraction at all (ADR decision 5).
// @param {import('./campaign-creation.types').ExtractedFacts} facts
// @returns {Promise<import('./campaign-creation.types').Brief & { trace: object[] }>}
exports.buildBriefFromFacts = async (facts) => {
  const tracer = createTracer('CampaignCreationPipeline.buildBriefFromFacts');

  const brief = await tracer.trace('BriefBuilder', () => briefBuilder.build(facts),
    (b) => ({ category: b.category.value, hasTargetAmount: b.suggestedTargetAmount.value != null }));

  tracer.print();
  return { ...brief, trace: tracer.steps };
};

// Sprint 3 — no LLM, deterministic. Not named with an async tracer step the
// way Extraction/Brief are (there's no LLM call to time/trace) — this is
// plain data mapping, exposed directly for that reason.
// @param {import('./campaign-creation.types').Brief} brief
// @returns {{ campaignDraftPatch: object, organizationDraftPatch: object, unmapped: object }}
exports.mapBriefToDraftPatches = (brief) => {
  const campaign = draftBuilder.toCampaignDraftPatch(brief);
  const organization = draftBuilder.toOrganizationDraftPatch(brief);
  return {
    campaignDraftPatch: campaign.patch,
    organizationDraftPatch: organization.patch,
    unmapped: campaign.unmapped,
  };
};
