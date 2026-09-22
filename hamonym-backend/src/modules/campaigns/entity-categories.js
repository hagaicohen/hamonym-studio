// Canonical campaign/entity category ids (2026-09-23) -- backend-side copy
// of hamonym-app's src/app/shared/config/entity-categories.ts. The two repos
// have no shared build/package setup, so this is a plain, manually-kept-in-
// sync copy rather than a real import -- scripts/test-campaign-category-
// validation.js asserts byte-for-byte agreement with the frontend file (by
// reading it directly, no build coupling) so the two can never silently
// drift without a failing test catching it. Used only for validating a
// campaign.category write in campaigns.service.js#updateCampaign.
const ENTITY_CATEGORY_IDS = [
  'aid-support', 'animals', 'art', 'content-creators', 'culture', 'education',
  'environment', 'entrepreneurship', 'foreign-security', 'health', 'history',
  'holocaust-memory', 'human-rights', 'independent-creators',
  'independent-journalism', 'judaism', 'law-justice', 'lifestyle',
  'literature-books', 'mental-health', 'military-security', 'nature',
  'politics-government', 'political-system', 'public-policy',
  'quality-of-life', 'religion', 'rescue-memory', 'science-technology',
  'social-change', 'sports', 'other',
];

const VALID_CATEGORY_IDS = new Set(ENTITY_CATEGORY_IDS);

exports.ENTITY_CATEGORY_IDS = ENTITY_CATEGORY_IDS;
exports.isValidCategoryId = (id) => VALID_CATEGORY_IDS.has(id);
