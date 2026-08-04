// Pass 1 — Profile Target Resolver. Decides which already-extracted
// content chunks belong to the Partner's evergreen Profile (about/gallery/
// hours/address), campaign-agnostic. Named "resolver" not "classifier": it
// maps content to domain targets, it does not judge/label content in
// isolation and knows nothing about CampaignBlock/the Builder — see
// partner-import.types.js's INVARIANTS (4).

const llmService = require('../../llm.service');
const { PROFILE_SYSTEM_PROMPT, buildProfilePrompt } = require('../partner-import.prompt');
const { validateAndResolve } = require('../resolution.validator');
const { PROFILE_TARGETS } = require('../partner-import.types');

// @param {import('../partner-import.types').NormalizedBlock[]} blocks
// @returns {Promise<import('../partner-import.types').ResolvedEntry[]>}
exports.resolve = async (blocks) => {
  if (!blocks.length) return [];
  // temperature: 0 — classification, not prose; run-to-run consistency
  // matters more than variety, same reasoning as free-text.extractor.js.
  const raw = await llmService.complete(PROFILE_SYSTEM_PROMPT, buildProfilePrompt(blocks), { temperature: 0 });
  return validateAndResolve(raw, blocks, PROFILE_TARGETS);
};
