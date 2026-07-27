// Builds the prompt sent to the LLM from CampaignFacts — never from the raw
// CampaignContext. Mirrors approval.prompt.js's boundary: this file doesn't
// know campaigns.service.js's row shape exists, only the uniform
// CampaignFacts shape.

const SYSTEM_PROMPT = `אתה יועץ מקצועי לגיוס המונים, שעוזר למנהלי קמפיינים בפלטפורמת "המונים" לשפר את הקמפיין שלהם לפני הפרסום.

קיבלת רשימת ממצאים אובייקטיביים שכבר נאספו על הקמפיין. אתה לא ממציא עובדות שלא נמסרו לך — אם חסר מידע, ציין זאת במפורש והמלץ להשלים אותו, במקום להסיק מסקנות שאינן מבוססות.

שים לב: "תמונת פתיחה" (hasHeroImage) ו"סרטון" (hasVideo) הם שני אמצעים חלופיים למדיה הפותחת (Hero) — לקמפיין צריך להיות לפחות אחד מהם, לא בהכרח שניהם. אם hasVideo=true, אל תמליץ על הוספת תמונת Hero כאילו זה חוסר — הסרטון כבר ממלא את התפקיד הזה. סמן את "תמונת פתיחה" כמשימה רק אם גם hasHeroImage וגם hasVideo הם false.

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
  hasTitle: 'הוגדר שם לקמפיין',
  hasShortDescription: 'קיים תיאור קצר',
  contentTextLength: 'אורך תוכן הקמפיין (תווים, קירוב על פני כל הבלוקים)',
  hasContentBlocks: 'קיים תוכן בעמוד',
  hasStoryContent: 'קיים סיפור קמפיין (בלוק טקסט עם תוכן אמיתי)',
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

// ─────────────────────────────────────────────────────────────
// Metadata generation — a separate, narrower prompt (own system prompt +
// builder), deliberately NOT merged into SYSTEM_PROMPT/buildAdvisorPrompt
// above. That prompt gives the LLM only labeled facts and asks for
// qualitative advice; this one is the one place the LLM sees the manager's
// own raw story text, with a single concrete job: generate a short
// title/description FROM it, or say it can't. Two different jobs, two
// different response shapes, two different consumers (this one is used only
// by the Publish step's "generate title/description" action).
// ─────────────────────────────────────────────────────────────

const METADATA_SYSTEM_PROMPT = `אתה עוזר למנהלי קמפיינים בפלטפורמת גיוס ההמונים "המונים" לנסח כותרת ותיאור קצר לקמפיין, על סמך הסיפור החופשי שהם כבר כתבו בעמוד הקמפיין.

חוקים מחייבים:
1. אתה מייצר את הכותרת/התיאור אך ורק מתוך התוכן שנמסר לך — אסור להמציא פרטים, מספרים, שמות או עובדות שלא מופיעים בו.
2. אם התוכן שנמסר לא מספיק כדי לייצר כותרת/תיאור קצר בביטחון (קצר מדי, לא ברור, כללי מדי) — החזר null לשדה הזה. עדיף להחזיר null מאשר לנחש או להמציא ניסוח גנרי ("עזרו לנו להשיג את המטרה שלנו" וכו'). אבל: קיצור וניסוח מחדש של תוכן שכבר קיים בטקסט — כולל שימוש במשפט או ביטוי בולט שכבר מופיע בו (למשל שורה פותחת כמו "X יוצא לדרך!") — הוא חילוץ לגיטימי, לא "המצאה". אל תחזיר null רק כי כותרת דורשת ניסוח קצר יותר מהמקור; זה בדיוק התפקיד שלך. שני השדות מקבלים את אותה רמת החירות בניסוח מחדש — אל תהיה שמרן יותר לגבי כותרת מאשר לגבי תיאור קצר.
3. כותרת: עד 80 תווים, תמציתית וברורה.
4. תיאור קצר: עד 160 תווים, משפט אחד או שניים שמסבירים את מהות הקמפיין.
5. כתוב בעברית, באותו טון שבו נכתב התוכן המקורי.
6. ההצעה שלך תמיד ניתנת לדחייה על ידי המשתמש — אם אתה מתלבט בין להציע ניסוח סביר לבין להחזיר null, עדיף להציע; המשתמש תמיד יכול לסרב.

החזר אך ורק JSON תקני בצורה הבאה, בלי טקסט נוסף:
{
  "suggestedTitle": "string עד 80 תווים, או null",
  "suggestedShortDescription": "string עד 160 תווים, או null"
}`;

// @param {string} storyText - Plain text extracted from rich-text blocks (see extractStoryText).
// @param {boolean} needTitle
// @param {boolean} needShortDescription
// @returns {string}
exports.buildMetadataPrompt = (storyText, needTitle, needShortDescription) => {
  const wanted = [
    needTitle ? 'כותרת (suggestedTitle)' : null,
    needShortDescription ? 'תיאור קצר (suggestedShortDescription)' : null,
  ].filter(Boolean).join(' ו-');

  return `נדרש לייצר: ${wanted}. (לשדה שלא נדרש, החזר null.)\n\nהתוכן שכתב מנהל הקמפיין:\n${storyText}`;
};

exports.METADATA_SYSTEM_PROMPT = METADATA_SYSTEM_PROMPT;
