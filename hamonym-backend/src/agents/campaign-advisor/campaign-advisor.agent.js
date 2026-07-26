const campaignDataTool = require('./tools/campaign-data.tool');
const { buildCampaignFacts, extractStoryText } = require('./campaign-advisor.analysis');
const { buildAdvisorPrompt, SYSTEM_PROMPT, buildMetadataPrompt, METADATA_SYSTEM_PROMPT } = require('./campaign-advisor.prompt');
const llmService = require('../llm.service');
const { createTracer } = require('../trace.util');

// Below this length there's nothing real to work with — skip the LLM call
// entirely rather than spend an API call on a title for one line of text.
const MIN_STORY_TEXT_LENGTH = 20;

// CampaignAdvisorAgent — single entry point for the MVP (see
// CAMPAIGN_ADVISOR_AGENT_FUNCTIONAL_SPEC.md). Unlike ApprovalAgent there's
// no separate analyze()/recommend() split — the spec only calls for one
// use case (advise), so one method is all that's needed; adding a second
// "Context only" entry point now would be speculative, not justified by an
// actual second consumer the way ApprovalAgent's analyze() was.
//
// @param {string} campaignId
// @param {string|number} userId - Ownership-checked by campaignsService.getCampaignById.
// @returns {Promise<import('./campaign-advisor.types').AdvisorResponse & { trace: object[] }>}
exports.advise = async (campaignId, userId) => {
  const tracer = createTracer('CampaignAdvisorAgent.advise');

  const context = await tracer.trace('CampaignDataTool', () => campaignDataTool.loadCampaign(campaignId, userId),
    (r) => ({ found: !!r }));
  if (!context) throw new Error('Campaign not found');

  const facts = await tracer.trace('CampaignAnalysisEngine', () => Promise.resolve(buildCampaignFacts(context)),
    (f) => ({ facts: Object.keys(f).length }));
  const userPrompt = await tracer.trace('PromptBuilder', () => Promise.resolve(buildAdvisorPrompt(facts)),
    (p) => ({ chars: p.length }));
  const response = await tracer.trace('LLM', () => llmService.complete(SYSTEM_PROMPT, userPrompt),
    (r) => ({ tasks: r.tasks?.length ?? 0 }));

  // The prompt already tells the LLM that a video substitutes for a Hero
  // image, but that's a soft instruction — it isn't reliably followed
  // (observed: praising the video as a strength in the same response while
  // still flagging "Hero Image" as a gap). Enforce it deterministically
  // instead of trusting the model every time.
  if (facts.hasVideo && response.tasks) {
    response.tasks = response.tasks.filter(t => t.topic !== 'Hero Image');
  }

  tracer.print();
  console.log('CampaignAdvisorAgent.advise result for campaign', campaignId, ':', JSON.stringify(response, null, 2));
  return { ...response, trace: tracer.steps };
};

// generateMetadata — a separate, narrower entry point from advise() above:
// generates a title/short-description candidate from the manager's own free
// text (see campaign-advisor.prompt.js's METADATA_SYSTEM_PROMPT for why this
// is deliberately not folded into advise()'s response). Used by the Publish
// step only, only when the dedicated title/shortDescription fields are
// empty — the Builder itself never tries to interpret free text; this is the
// one, explicit, user-triggered place that does.
//
// @param {string} campaignId
// @param {string|number} userId - Ownership-checked by campaignsService.getCampaignById.
// @returns {Promise<{ suggestedTitle: string|null, suggestedShortDescription: string|null }>}
exports.generateMetadata = async (campaignId, userId) => {
  const tracer = createTracer('CampaignAdvisorAgent.generateMetadata');

  const context = await tracer.trace('CampaignDataTool', () => campaignDataTool.loadCampaign(campaignId, userId),
    (r) => ({ found: !!r }));
  if (!context) throw new Error('Campaign not found');

  const facts = await tracer.trace('CampaignAnalysisEngine', () => Promise.resolve(buildCampaignFacts(context)),
    (f) => ({ hasTitle: f.hasTitle, hasShortDescription: f.hasShortDescription }));

  const needTitle = !facts.hasTitle;
  const needShortDescription = !facts.hasShortDescription;

  const empty = { suggestedTitle: null, suggestedShortDescription: null };
  if (!needTitle && !needShortDescription) {
    tracer.print();
    return empty;
  }

  const storyText = await tracer.trace('ExtractStoryText', () => Promise.resolve(extractStoryText(context.blocks)),
    (t) => ({ chars: t.length }));
  if (storyText.length < MIN_STORY_TEXT_LENGTH) {
    tracer.print();
    return empty;
  }

  const userPrompt = await tracer.trace('PromptBuilder', () => Promise.resolve(buildMetadataPrompt(storyText, needTitle, needShortDescription)),
    (p) => ({ chars: p.length }));
  const response = await tracer.trace('LLM', () => llmService.complete(METADATA_SYSTEM_PROMPT, userPrompt),
    (r) => ({ suggestedTitle: !!r.suggestedTitle, suggestedShortDescription: !!r.suggestedShortDescription }));

  tracer.print();
  console.log('CampaignAdvisorAgent.generateMetadata result for campaign', campaignId, ':', JSON.stringify(response, null, 2));
  return {
    suggestedTitle: needTitle ? (response.suggestedTitle || null) : null,
    suggestedShortDescription: needShortDescription ? (response.suggestedShortDescription || null) : null,
  };
};
