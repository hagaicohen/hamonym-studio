export interface EntityCategory {
  id: string;
  label: string;
}

export const ENTITY_CATEGORIES: EntityCategory[] = [
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
  { id: 'other',                 label: 'אחר' },
];
