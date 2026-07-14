// Campaign Analysis Engine — deliberately not called "Facts Engine" or
// "Validation Engine" like ApprovalAgent's equivalent (see
// CAMPAIGN_ADVISOR_AGENT_FUNCTIONAL_SPEC.md §3): this Agent advises, it
// doesn't validate — there's no pass/warning/fail verdict here, only
// objective findings. Same underlying principle as ApprovalAgent's
// Validation Engine though: the LLM shouldn't have to "discover" things the
// code can already compute directly (image present? goal set? how much
// content is there?) — it should receive them and reason over them.

function extractTextLength(blocks) {
  let length = 0;
  const walk = (node) => {
    if (typeof node === 'string') { length += node.length; return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') { Object.values(node).forEach(walk); }
  };
  walk(blocks);
  return length;
}

// @param {import('./campaign-advisor.types').CampaignContext} context
// @returns {import('./campaign-advisor.types').CampaignFacts}
exports.buildCampaignFacts = (context) => {
  return {
    title: context.title,
    hasShortDescription: !!context.shortDescription,
    contentTextLength: extractTextLength(context.blocks),
    hasContentBlocks: context.blocks.length > 0,
    hasHeroImage: !!context.coverImageUrl,
    hasVideo: !!context.videoUrl,
    hasHeroCta: !!context.heroCtaConfig && Object.keys(context.heroCtaConfig).length > 0,
    targetAmount: context.targetAmount,
    currentAmount: context.currentAmount,
    suggestedAmountsCount: context.suggestedAmounts.length,
    allowsCustomAmount: context.allowCustomAmount,
    allowsMonthlyDonation: context.allowMonthlyDonation,
    rewardsEnabled: context.rewardsEnabled,
    rewardsCount: context.rewardsEnabled ? context.rewards.length : 0,
    status: context.status,
    category: context.category,
    supportersCount: context.supportersCount,
  };
};
