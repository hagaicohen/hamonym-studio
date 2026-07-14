const entityTool = require('./tools/entity.tool');
const guidestarTool = require('./tools/guidestar.tool');
const websearchTool = require('./tools/websearch.tool');
const documentTool = require('./tools/document.tool');
const campaignsTool = require('./tools/campaigns.tool');
const llmService = require('../llm.service');
const { buildApprovalFacts } = require('./approval.facts');
const { buildApprovalChecks } = require('./approval.checks');
const { buildApprovalPrompt, SYSTEM_PROMPT } = require('./approval.prompt');
const { createTracer } = require('../trace.util');

// Collects and shapes raw data into an ApprovalContext (see
// approval.types.js). Pure data gathering — no analysis, no LLM call.
//
// @param {string} entityId
// @param {ReturnType<typeof createTracer>} [callerTracer] - Reuses the caller's tracer (recommend()) if given, otherwise creates its own so analyze() alone still prints a trace.
// @returns {Promise<import('./approval.types').ApprovalContext>}
exports.analyze = async (entityId, callerTracer) => {
  const tracer = callerTracer || createTracer('ApprovalAgent.analyze');

  const [entity, webSearch, documents, campaigns] = await Promise.all([
    tracer.trace('EntityTool', () => entityTool.loadEntity(entityId),
      (r) => ({ found: !!r })),
    tracer.trace('WebSearchTool', () => websearchTool.searchWeb(entityId),
      (r) => ({ results: r ? r.length : 0 })),
    tracer.trace('DocumentTool', () => documentTool.loadDocuments(entityId),
      (r) => ({ documents: r.length, uploaded: r.filter((d) => d.hasData).length })),
    tracer.trace('CampaignsTool', () => campaignsTool.loadCampaigns(entityId),
      (r) => ({ campaigns: r.length })),
  ]);

  // Needs entity.registrationNumber — GuideStar has no concept of our
  // internal entityId — so it can only run after EntityTool resolves.
  const guideStar = await tracer.trace('GuideStarTool', () => guidestarTool.loadGuideStarInfo(entity?.registrationNumber),
    (r) => ({ status: r ? 'found' : 'not_found' }));

  if (!callerTracer) tracer.print();
  return { entity, guideStar, webSearch, documents, campaigns };
};

// Runs analyze(), normalizes the Context into ApprovalFacts, runs the
// Validation Engine to turn Facts into ApprovalChecks (explicit
// pass/warning/fail verdicts — a business decision the code makes, not the
// LLM), builds a prompt from those Checks, and asks the LLM for a
// recommendation. The LLM only ever sees already-judged Checks via the
// prompt string — never raw DB rows, never payment credentials, never
// GuideStar's/Documents'/Entity's own shapes, and never a fact it has to
// (re-)judge itself.
//
// @returns {Promise<import('./approval.types').ApprovalRecommendation & { trace: object[] }>}
exports.recommend = async (entityId) => {
  const tracer = createTracer('ApprovalAgent.recommend');

  const context = await exports.analyze(entityId, tracer);
  const facts = await tracer.trace('Normalizer', () => Promise.resolve(buildApprovalFacts(context)),
    (f) => ({ facts: Object.keys(f).length }));
  const checks = await tracer.trace('ValidationEngine', () => Promise.resolve(buildApprovalChecks(facts)),
    (c) => ({ pass: c.filter((x) => x.status === 'pass').length, warning: c.filter((x) => x.status === 'warning').length, fail: c.filter((x) => x.status === 'fail').length }));
  const userPrompt = await tracer.trace('PromptBuilder', () => Promise.resolve(buildApprovalPrompt(facts.entityName, checks)),
    (p) => ({ chars: p.length }));
  const recommendation = await tracer.trace('LLM', () => llmService.complete(SYSTEM_PROMPT, userPrompt),
    (r) => ({ confidence: r.confidence }));

  tracer.print();
  console.log('ApprovalAgent.recommend result for entity', entityId, ':', JSON.stringify(recommendation, null, 2));
  return { ...recommendation, checks, trace: tracer.steps };
};
