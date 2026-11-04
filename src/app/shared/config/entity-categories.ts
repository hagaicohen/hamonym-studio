export interface EntityCategory {
  id: string;
  label: string;
}

const RAW_ENTITY_CATEGORIES: EntityCategory[] = [
  { id: 'aid-support',           label: 'סיוע לנזקקים' },
  { id: 'animals',               label: 'בעלי חיים' },
  { id: 'art',                   label: 'אמנות' },
  { id: 'content-creators',      label: 'יוצרי תוכן' },
  { id: 'culture',               label: 'תרבות' },
  { id: 'education',             label: 'חינוך' },
  { id: 'environment',           label: 'סביבה' },
  { id: 'entrepreneurship',      label: 'יזמות' },
  { id: 'foreign-security',      label: 'ביטחון חוץ' },
  { id: 'health',                label: 'בריאות' },
  { id: 'history',               label: 'היסטוריה' },
  { id: 'holocaust-memory',      label: 'שואה וזיכרון' },
  { id: 'human-rights',          label: 'זכויות אדם' },
  { id: 'independent-creators',  label: 'יוצרים עצמאיים' },
  { id: 'independent-journalism', label: 'עיתונאות עצמאית' },
  { id: 'judaism',               label: 'יהדות' },
  { id: 'law-justice',           label: 'משפט וצדק' },
  { id: 'lifestyle',             label: 'אורח חיים' },
  { id: 'literature-books',      label: 'ספרות וספרים' },
  { id: 'mental-health',         label: 'בריאות הנפש' },
  { id: 'military-security',     label: 'צבא וכוחות ביטחון' },
  { id: 'nature',                label: 'טבע' },
  { id: 'politics-government',   label: 'פוליטיקה וממשל' },
  { id: 'political-system',      label: 'מערכת פוליטית' },
  { id: 'public-policy',         label: 'מדיניות ציבורית' },
  { id: 'quality-of-life',       label: 'איכות חיים' },
  { id: 'religion',              label: 'דת' },
  { id: 'rescue-memory',         label: 'הצלה וזיכרון' },
  { id: 'science-technology',    label: 'מדע וטכנולוגיה' },
  { id: 'social-change',         label: 'שינוי חברתי' },
  { id: 'sports',                label: 'ספורט' },
  // Added 2026-11-03; mirrored in hamonym-backend entity-categories.js.
  { id: 'settlement',                 label: 'התיישבות' },
  { id: 'agriculture',                label: 'חקלאות' },
  { id: 'youth-movements',            label: 'תנועות נוער' },
  { id: 'security-rescue',            label: 'ביטחון והצלה' },
  { id: 'soldiers-reservists',        label: 'חיילים ומילואים' },
  { id: 'bereaved-families',          label: 'משפחות שכולות' },
  { id: 'heritage-commemoration',     label: 'מורשת והנצחה' },
  { id: 'communities',                label: 'קהילות ויישובים' },
  { id: 'employment-training',        label: 'תעסוקה והכשרה מקצועית' },
  { id: 'immigrant-absorption',       label: 'קליטת עלייה' },
  { id: 'disabilities-accessibility', label: 'מוגבלויות ונגישות' },
  { id: 'food-security',              label: 'מזון וביטחון תזונתי' },
  { id: 'housing',                    label: 'דיור' },
  { id: 'research-development',       label: 'מחקר ופיתוח' },
  { id: 'other',                 label: 'אחר' },
];

const HEBREW_COLLATOR = new Intl.Collator('he-IL', { sensitivity: 'base' });

// Sorted alphabetically (he-IL collation) by label — every consumer (dropdown
// and chip pickers alike) imports this single ordered array, so sorting it
// once here keeps them all in sync automatically. "אחר" (Other) is pinned
// last regardless — it starts with א like several real categories, and
// alphabetizing it in would bury it near the top instead of at the
// conventional catch-all spot.
export const ENTITY_CATEGORIES: EntityCategory[] = [
  ...RAW_ENTITY_CATEGORIES
    .filter((c) => c.id !== 'other')
    .sort((a, b) => HEBREW_COLLATOR.compare(a.label, b.label)),
  ...RAW_ENTITY_CATEGORIES.filter((c) => c.id === 'other'),
];
