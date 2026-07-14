const campaignDataTool = require('./tools/campaign-data.tool');
const { buildCampaignFacts } = require('./campaign-advisor.analysis');
const { buildAdvisorPrompt, SYSTEM_PROMPT } = require('./campaign-advisor.prompt');
const llmService = require('../llm.service');
const { createTracer } = require('../trace.util');

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

  tracer.print();
  console.log('CampaignAdvisorAgent.advise result for campaign', campaignId, ':', JSON.stringify(response, null, 2));
  return { ...response, trace: tracer.steps };
};
