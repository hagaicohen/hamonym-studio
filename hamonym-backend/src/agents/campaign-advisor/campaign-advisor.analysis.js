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

// Mirrors the frontend's hasStoryBlock check (campaign-publish-step.component.ts)
// exactly, so the Advisor and the Builder agree on what "has a story" means.
// More precise than contentTextLength/hasContentBlocks, which count every
// block type (stats, donation-widget, etc.), not story text specifically.
function hasStoryContent(blocks) {
  return (blocks || []).some((b) => {
    if (b.type !== 'rich-text') return false;
    const content = (b.data && b.data.content) || '';
    return !!content.replace(/<[^>]*>/g, '').trim();
  });
}

// Same rich-text-only, HTML-stripped scan as hasStoryContent, but returns
// the actual text instead of a boolean. Used only by generateMetadata (see
// campaign-advisor.agent.js) — the one place in this Agent the LLM is
// deliberately given raw content, because producing a title/description
// FROM free text is the task itself (unlike buildCampaignFacts below, which
// keeps the LLM away from raw content on purpose — see CampaignFacts' doc
// comment in campaign-advisor.types.js).
function extractStoryText(blocks) {
  return (blocks || [])
    .filter((b) => b.type === 'rich-text')
    .map((b) => ((b.data && b.data.content) || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}
exports.extractStoryText = extractStoryText;

// @param {import('./campaign-advisor.types').CampaignContext} context
// @returns {import('./campaign-advisor.types').CampaignFacts}
exports.buildCampaignFacts = (context) => {
  // A campaign with no title yet still gets a cosmetic placeholder written
  // to the DB on first save (campaigns.service.js's DEFAULT_TITLE, so saves
  // never block on an empty title mid-edit) — treating that placeholder as
  // "a real title" made this Agent silently skip both the "add a title"
  // recommendation and the title suggestion in generateMetadata, every
  // single time, for any campaign whose manager hasn't set one yet. See
  // DECISIONS.md (2026-07-17).
  const { DEFAULT_TITLE } = require('../../modules/campaigns/campaigns.service');
  const realTitle = context.title && context.title.trim() !== DEFAULT_TITLE ? context.title.trim() : '';
  return {
    title: realTitle,
    hasTitle: !!realTitle,
    hasShortDescription: !!context.shortDescription,
    contentTextLength: extractTextLength(context.blocks),
    hasContentBlocks: context.blocks.length > 0,
    hasStoryContent: hasStoryContent(context.blocks),
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
