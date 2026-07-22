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
