const campaignsService = require('../../../modules/campaigns/campaigns.service');

// Single Tool for the MVP (see CAMPAIGN_ADVISOR_AGENT_FUNCTIONAL_SPEC.md) —
// campaigns.service.js's getCampaignById already returns everything needed
// from one place in the same backend, so there's no benefit to splitting
// into per-field tools yet. Shapes the raw row into CampaignContext instead
// of passing it through — this is also where a future field to exclude
// (if one ever appears on `campaigns`) would get filtered.
exports.loadCampaign = async (campaignId, userId) => {
  const row = await campaignsService.getCampaignById({ campaignId, userId });
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    shortDescription: row.short_description,
    status: row.status,
    category: row.category,
    targetAmount: Number(row.target_amount),
    currentAmount: Number(row.current_amount),
    startDate: row.start_date,
    endDate: row.end_date,
    coverImageUrl: row.cover_image_url,
    videoUrl: row.video_url,
    heroCtaConfig: row.hero_cta_config,
    heroCustomHtml: row.hero_custom_html,
    enableSuggestedAmounts: !!row.enable_suggested_amounts,
    suggestedAmounts: row.suggested_amounts || [],
    allowCustomAmount: !!row.allow_custom_amount,
    allowMonthlyDonation: !!row.allow_monthly_donation,
    rewardsEnabled: !!row.rewards_enabled,
    rewards: row.rewards || [],
    blocks: row.blocks || [],
    supportersCount: row.supporters_count || 0,
  };
};
