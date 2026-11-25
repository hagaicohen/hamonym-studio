/** Menu entries and the settings search of the management screen (moved from the engine). */
export interface NavEntry { id: string; icon: string; title: string; }
export interface NavSetting { label: string; hint: string; page?: string; edit?: string; keys: string; }

export const NAV_ENTRIES: readonly NavEntry[] = [
  { id: 'overview', icon: '◫', title: 'סקירה' },
  { id: 'identity', icon: '▣', title: 'פרטי הקמפיין' },
  { id: 'race', icon: '♜', title: 'ניהול מירוץ' },
  { id: 'fundraising', icon: '₪', title: 'תרומות וגיוס' },
  { id: 'modules', icon: '▦', title: 'תוכן הקמפיין' }
];

/** Extra search words per menu entry. */
const NAV_KEYWORDS: Record<string, string> = {
  identity: 'hero כותרת קטגוריה סיפור',
  race: 'מקצים הרשמה משתתפים',
  fundraising: 'יעד תרומות תשלומים שגרירים תורמים פרטיות חשיפה',
  modules: 'תשורות חסויות עדכונים תגובות'
};

export const NAV_SETTINGS: readonly NavSetting[] = [
  { label: 'צבע כפתור התרומה', hint: 'עיצוב תיבת התרומה', edit: 'donationBox', keys: 'צבע כפתור תרומה עיצוב' },
  { label: 'צבעים וגופנים', hint: 'עיצוב כללי', edit: 'theme', keys: 'פונט גופן צבעים ערכת נושא' },
  { label: 'תמונת Hero ולוגו', hint: 'פרטים ותוכן', page: 'identity', keys: 'hero תמונה לוגו וידאו' },
  { label: 'תיאור וסיפור הקמפיין', hint: 'פרטים ותוכן', page: 'identity', keys: 'סיפור טקסט תיאור' },
  { label: 'יעד וסכום הגיוס', hint: 'יעדים ומודל גיוס', page: 'funding', keys: 'יעד סכום תקציב' },
  { label: 'תשלומים ותרומה חודשית', hint: 'הגדרות תרומות', page: 'donations', keys: 'תשלומים חודשי סליקה' },
  { label: 'הצגה והסתרה של רכיבים', hint: 'חשיפה והצגה', page: 'visibility', keys: 'הסתר הצג חשיפה' },
  { label: 'כפתורי השיתוף', hint: 'עיצוב', edit: 'share', keys: 'שיתוף וואטסאפ רשתות' }
];

const norm = (s: string): string => s.trim().toLocaleLowerCase('he');

export function navEntries(term: string, isRace: boolean): NavEntry[] {
  const t = norm(term);
  return NAV_ENTRIES.filter(e => (e.id !== 'race' || isRace) && (!t || norm(e.title + ' ' + (NAV_KEYWORDS[e.id] || '')).includes(t)));
}

export function navSettings(term: string): NavSetting[] {
  const t = norm(term);
  if (!t) return [];
  return NAV_SETTINGS.filter(x => norm(x.label + ' ' + x.hint + ' ' + x.keys).includes(t));
}

/** The fundraising entry stays highlighted for its three former sub-pages. */
export function navActive(entry: string, page: string): boolean {
  return page === entry || (entry === 'fundraising' && ['funding', 'donations', 'visibility'].includes(page));
}
