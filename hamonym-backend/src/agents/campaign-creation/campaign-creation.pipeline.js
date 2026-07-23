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
const websiteExtractor = require('./extractors/website.extractor');
const documentCollectionExtractor = require('./extractors/document-collection.extractor');
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

// Website Extractor — MVP §10. Hard failures (invalid URL, SSRF-blocked,
// timeout, non-2xx) throw WebsiteFetchError *before* the FreeTextExtractor
// step even starts — callers should catch that specifically to show the
// "couldn't reach this site" message immediately, per the hard-fail/
// partial-success boundary in the acceptance criteria (thin-but-fetched
// content is NOT a hard failure — it flows through to FreeTextExtractor's
// own graceful-null handling instead).
// @param {string} url
// @returns {Promise<import('./campaign-creation.types').ExtractedFacts & { trace: object[] }>}
exports.extractFromWebsite = async (url) => {
  const tracer = createTracer('CampaignCreationPipeline.extractFromWebsite');

  const facts = await tracer.trace('WebsiteExtractor', () => websiteExtractor.extract(url),
    (f) => ({ hasOrgName: !!f.organizationName, hasTitle: !!f.suggestedTitle }));

  tracer.print();
  return { ...facts, trace: tracer.steps };
};

// Combined intake — one Extraction call over any mix of free text, a
// website URL, and uploaded type-tagged files, all optional (at least one
// required — enforced by the controller, not here). Not per-source
// extraction + merge (the rejected Facts Merger idea) — everything is
// aggregated into one prompt before the single LLM call happens.
// @param {Array<{ buffer: Buffer, mimeType: string, typeLabel: string, note?: string }>} files
// @param {string} [freeText]
// @param {string} [websiteUrl]
// @returns {Promise<import('./campaign-creation.types').ExtractedFacts & { trace: object[] }>}
exports.extractFromDocuments = async (files, freeText, websiteUrl) => {
  const tracer = createTracer('CampaignCreationPipeline.extractFromDocuments');

  const facts = await tracer.trace('DocumentCollectionExtractor', () => documentCollectionExtractor.extract(files, freeText, websiteUrl),
    (f) => ({ hasOrgName: !!f.organizationName, hasTitle: !!f.suggestedTitle, fileCount: files.length }));

  tracer.print();
  return { ...facts, trace: tracer.steps };
};

// Sprint 2 — validates the Facts→Brief contract in isolation. Takes
// ExtractedFacts directly (not text) so it can be tested/regenerated without
// touching Extraction at all (ADR decision 5).
// @param {import('./campaign-creation.types').ExtractedFacts} facts
// @param {{ text: string, sources: Array<{title: string, url: string}> } | null} [research] - optional, real internet research (2026-07-23, explicit opt-in — see organization-research.tool.js)
// @param {Array<{question: string, answer: string}>} [userAnswers] - optional, campaign manager's own answers to a previous round's clarifyingQuestions (2026-07-23)
// @returns {Promise<import('./campaign-creation.types').Brief & { trace: object[] }>}
exports.buildBriefFromFacts = async (facts, research, userAnswers) => {
  const tracer = createTracer('CampaignCreationPipeline.buildBriefFromFacts');

  const brief = await tracer.trace('BriefBuilder', () => briefBuilder.build(facts, research, userAnswers),
    (b) => ({ category: b.category.value, hasTargetAmount: b.suggestedTargetAmount.value != null, hasResearch: !!research, questionCount: b.clarifyingQuestions.length }));

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
