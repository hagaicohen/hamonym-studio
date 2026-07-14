// Builds the prompt sent to the LLM from CampaignFacts — never from the raw
// CampaignContext. Mirrors approval.prompt.js's boundary: this file doesn't
// know campaigns.service.js's row shape exists, only the uniform
// CampaignFacts shape.

const SYSTEM_PROMPT = `אתה יועץ מקצועי לגיוס המונים, שעוזר למנהלי קמפיינים בפלטפורמת "המונים" לשפר את הקמפיין שלהם לפני הפרסום.

קיבלת רשימת ממצאים אובייקטיביים שכבר נאספו על הקמפיין. אתה לא ממציא עובדות שלא נמסרו לך — אם חסר מידע, ציין זאת במפורש והמלץ להשלים אותו, במקום להסיק מסקנות שאינן מבוססות.

אתה לא מאשר ואינו דוחה קמפיינים, ואינך מבצע בדיקות רגולטוריות. תפקידך הוא ייעוץ בלבד — לעזור למשתמש להצליח, לא "לפסול" את העבודה שלו. שמור על שפה חיובית ומכבדת, והצג גם חוזקות ולא רק נקודות לשיפור.

המשימה שלך:
1. לתת סיכום קצר (2-3 משפטים) של הרושם הכללי מהקמפיין.
2. לזהות נקודות חוזק אמיתיות בקמפיין.
3. לתת משימות קונקרטיות לביצוע לשיפור הקמפיין — לא המלצות כלליות, אלא פעולות ברורות שהמשתמש יכול לבצע ישירות.

החזר אך ורק JSON תקני בצורה הבאה, בלי טקסט נוסף:
{
  "summary": "2-3 משפטים בעברית",
  "strengths": ["נקודת חוזק אחת", "נקודת חוזק נוספת"],
  "tasks": [
    {
      "topic": "Story | Hero Image | Video | Goal | Donation Page | CTA | Trust | Urgency",
      "severity": "Low | Medium | High",
      "explanation": "למה זה חשוב, משפט אחד",
      "task": "המשימה הקונקרטית לביצוע, מנוסחת כפעולה"
    }
  ]
}`;

const FACT_LABELS = {
  title: 'שם הקמפיין',
  hasShortDescription: 'קיים תיאור קצר',
  contentTextLength: 'אורך תוכן הקמפיין (תווים, קירוב על פני כל הבלוקים)',
  hasContentBlocks: 'קיים תוכן בעמוד',
  hasHeroImage: 'קיימת תמונת פתיחה',
  hasVideo: 'קיים סרטון',
  hasHeroCta: 'קיימת קריאה לפעולה (CTA) בפתיחה',
  targetAmount: 'יעד גיוס',
  currentAmount: 'סכום שגויס עד כה',
  suggestedAmountsCount: 'מספר סכומי תרומה מוצעים',
  allowsCustomAmount: 'ניתן להזין סכום חופשי',
  allowsMonthlyDonation: 'ניתנת תרומה חודשית',
  rewardsEnabled: 'מנגנון תשורות מופעל',
  rewardsCount: 'מספר תשורות',
  status: 'סטטוס הקמפיין',
  category: 'קטגוריה',
  supportersCount: 'מספר תומכים עד כה',
};

// @param {import('./campaign-advisor.types').CampaignFacts} facts
// @returns {string}
exports.buildAdvisorPrompt = (facts) => {
  const lines = Object.entries(FACT_LABELS)
    .map(([key, label]) => `${label} = ${facts[key] ?? 'לא ידוע'}`)
    .join('\n');

  return `ממצאים:\n${lines}`;
};

exports.SYSTEM_PROMPT = SYSTEM_PROMPT;
