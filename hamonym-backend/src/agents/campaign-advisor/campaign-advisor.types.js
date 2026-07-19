// Documentation only — this backend is plain JS/CommonJS with no
// TypeScript, so there's no compiler to enforce this. Mirrors the pattern
// established in src/agents/approval/approval.types.js.

/**
 * @typedef {Object} CampaignContext
 * Shaped from campaigns.service.js's getCampaignById — a whitelist, not a
 * pass-through of the raw row (mirrors EntityTool's approach in
 * ApprovalAgent, which excludes payment fields from entities the same way).
 * @property {string} id
 * @property {string} title
 * @property {string|null} shortDescription
 * @property {string} status
 * @property {string|null} category
 * @property {number} targetAmount
 * @property {number} currentAmount
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {string|null} coverImageUrl
 * @property {string|null} videoUrl
 * @property {object|null} heroCtaConfig
 * @property {string|null} heroCustomHtml
 * @property {boolean} enableSuggestedAmounts
 * @property {number[]} suggestedAmounts
 * @property {boolean} allowCustomAmount
 * @property {boolean} allowMonthlyDonation
 * @property {boolean} rewardsEnabled
 * @property {array} rewards
 * @property {array} blocks - Raw page-builder blocks (no dedicated "story" column exists on campaigns).
 * @property {number} supportersCount
 */

/**
 * @typedef {Object} CampaignFacts
 * Built by campaign-advisor.analysis.js (Campaign Analysis Engine) from a
 * CampaignContext — objective findings, not verdicts (unlike ApprovalAgent's
 * ApprovalCheck, there's no pass/warning/fail here — this Agent advises, it
 * doesn't validate). Every value here is something the code already
 * computed; the LLM interprets these, it doesn't derive them.
 * @property {string} title
 * @property {boolean} hasTitle
 * @property {boolean} hasShortDescription
 * @property {number} contentTextLength - Approximate char count across all page-builder blocks (no dedicated "story" column exists — this is a best-effort proxy, not an exact story-only measure).
 * @property {boolean} hasContentBlocks
 * @property {boolean} hasStoryContent - Whether any rich-text block has real text content. Unlike contentTextLength/hasContentBlocks, this counts only story text, not other block types — mirrors the frontend's hasStoryBlock check. title/shortDescription/story are intentionally NOT required to publish (a manager may hide them from the hero or tell the story differently in the page body) — this Agent is where "you don't have one" becomes a recommendation instead.
 * @property {boolean} hasHeroImage
 * @property {boolean} hasVideo
 * @property {boolean} hasHeroCta
 * @property {number} targetAmount
 * @property {number} currentAmount
 * @property {number} suggestedAmountsCount
 * @property {boolean} allowsCustomAmount
 * @property {boolean} allowsMonthlyDonation
 * @property {boolean} rewardsEnabled
 * @property {number} rewardsCount
 * @property {string} status
 * @property {string|null} category
 * @property {number} supportersCount
 */

/**
 * @typedef {Object} AdvisorResponse
 * @property {string} summary - 2-3 sentences, Hebrew.
 * @property {string[]} strengths - What's already working well.
 * @property {Array<{ topic: string, severity: 'Low'|'Medium'|'High', explanation: string, task: string }>} tasks
 */

/**
 * @typedef {Object} MetadataSuggestion
 * Returned by CampaignAdvisorAgent.generateMetadata (campaign-advisor.agent.js).
 * A title/short-description candidate generated from the manager's own free
 * text (rich-text blocks) — never invented, never a generic filler. Either
 * field is null when it wasn't needed (the dedicated field already had a
 * value) or when there wasn't enough real content to generate one
 * confidently.
 * @property {string|null} suggestedTitle - Max 80 chars.
 * @property {string|null} suggestedShortDescription - Max 160 chars.
 */

module.exports = {};
