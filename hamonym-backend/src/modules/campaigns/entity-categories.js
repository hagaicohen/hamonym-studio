// Canonical campaign/entity categories (2026-09-23) -- backend-side copy
// of hamonym-app's src/app/shared/config/entity-categories.ts. The two repos
// have no shared build/package setup, so this is a plain, manually-kept-in-
// sync copy rather than a real import -- scripts/test-campaign-category-
// validation.js asserts agreement (ids and Hebrew labels) with the frontend
// file (by reading it directly, no build coupling) so the two can never
// silently drift without a failing test catching it. Used for validating a
// campaign.category write in campaigns.service.js#updateCampaign and for the
// closed category list in the AI campaign-creation prompt.
//
// Stored values are the ids; adding a category needs no migration.
const ENTITY_CATEGORIES = [
  { id: 'aid-support', label: 'סיוע לנזקקים' },
  { id: 'animals', label: 'בעלי חיים' },
  { id: 'art', label: 'אמנות' },
  { id: 'content-creators', label: 'יוצרי תוכן' },
  { id: 'culture', label: 'תרבות' },
  { id: 'education', label: 'חינוך' },
  { id: 'environment', label: 'סביבה' },
  { id: 'entrepreneurship', label: 'יזמות' },
  { id: 'foreign-security', label: 'ביטחון חוץ' },
  { id: 'health', label: 'בריאות' },
  { id: 'history', label: 'היסטוריה' },
  { id: 'holocaust-memory', label: 'שואה וזיכרון' },
  { id: 'human-rights', label: 'זכויות אדם' },
  { id: 'independent-creators', label: 'יוצרים עצמאיים' },
  { id: 'independent-journalism', label: 'עיתונאות עצמאית' },
  { id: 'judaism', label: 'יהדות' },
  { id: 'law-justice', label: 'משפט וצדק' },
  { id: 'lifestyle', label: 'אורח חיים' },
  { id: 'literature-books', label: 'ספרות וספרים' },
  { id: 'mental-health', label: 'בריאות הנפש' },
  { id: 'military-security', label: 'צבא וכוחות ביטחון' },
  { id: 'nature', label: 'טבע' },
  { id: 'politics-government', label: 'פוליטיקה וממשל' },
  { id: 'political-system', label: 'מערכת פוליטית' },
  { id: 'public-policy', label: 'מדיניות ציבורית' },
  { id: 'quality-of-life', label: 'איכות חיים' },
  { id: 'religion', label: 'דת' },
  { id: 'rescue-memory', label: 'הצלה וזיכרון' },
  { id: 'science-technology', label: 'מדע וטכנולוגיה' },
  { id: 'social-change', label: 'שינוי חברתי' },
  { id: 'sports', label: 'ספורט' },
  // Added 2026-11-03.
  { id: 'settlement', label: 'התיישבות' },
  { id: 'agriculture', label: 'חקלאות' },
  { id: 'youth-movements', label: 'תנועות נוער' },
  { id: 'security-rescue', label: 'ביטחון והצלה' },
  { id: 'soldiers-reservists', label: 'חיילים ומילואים' },
  { id: 'bereaved-families', label: 'משפחות שכולות' },
  { id: 'heritage-commemoration', label: 'מורשת והנצחה' },
  { id: 'communities', label: 'קהילות ויישובים' },
  { id: 'employment-training', label: 'תעסוקה והכשרה מקצועית' },
  { id: 'immigrant-absorption', label: 'קליטת עלייה' },
  { id: 'disabilities-accessibility', label: 'מוגבלויות ונגישות' },
  { id: 'food-security', label: 'מזון וביטחון תזונתי' },
  { id: 'housing', label: 'דיור' },
  { id: 'research-development', label: 'מחקר ופיתוח' },
  { id: 'other', label: 'אחר' },
];

const ENTITY_CATEGORY_IDS = ENTITY_CATEGORIES.map((c) => c.id);

const VALID_CATEGORY_IDS = new Set(ENTITY_CATEGORY_IDS);

exports.ENTITY_CATEGORIES = ENTITY_CATEGORIES;
exports.ENTITY_CATEGORY_IDS = ENTITY_CATEGORY_IDS;
exports.isValidCategoryId = (id) => VALID_CATEGORY_IDS.has(id);
// "id (label), ..." -- the closed list the AI campaign-creation prompt offers.
exports.categoryPromptList = () => ENTITY_CATEGORIES.map((c) => `${c.id} (${c.label})`).join(', ');
