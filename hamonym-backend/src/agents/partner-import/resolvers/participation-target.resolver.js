// Pass 2 — Participation Target Resolver. Given the SAME extracted content
// chunks plus one specific campaign's title/short description, decides
// what's relevant to THAT campaign's participation (coupon/campaignStory/
// campaignHero/cta/campaignImage) — separate from Pass 1 because this
// content is scoped to one campaign_partners row, never reused across
// other campaigns the same partner later joins. See
// docs/PARTNER_DOMAIN_MODEL_ADR.md §13.

const llmService = require('../../llm.service');
const { PARTICIPATION_SYSTEM_PROMPT, buildParticipationPrompt } = require('../partner-import.prompt');
const { validateAndResolve } = require('../resolution.validator');
const { PARTICIPATION_TARGETS } = require('../partner-import.types');

// @param {import('../partner-import.types').NormalizedBlock[]} blocks
// @param {{ title: string, shortDescription: string }} campaign
// @returns {Promise<import('../partner-import.types').ResolvedEntry[]>}
exports.resolve = async (blocks, campaign) => {
  if (!blocks.length) return [];
  const raw = await llmService.complete(PARTICIPATION_SYSTEM_PROMPT, buildParticipationPrompt(blocks, campaign), { temperature: 0 });
  return validateAndResolve(raw, blocks, PARTICIPATION_TARGETS);
};
