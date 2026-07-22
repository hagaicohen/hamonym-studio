// Builds the prompt sent to the LLM for free-text Extraction — see
// AI_CAMPAIGN_CREATION_MVP.md §2. Mirrors campaign-advisor.prompt.js's
// boundary: the LLM only ever sees the raw text the user typed, and is only
// ever asked to return the fields listed in campaign-creation.types.js's
// ExtractedFacts. free-text.extractor.js re-projects the parsed response
// onto that whitelist regardless of what the model actually returns — this
// prompt describes the contract, it doesn't enforce it.

const SYSTEM_PROMPT = `אתה עוזר לחלץ עובדות אובייקטיביות מטקסט חופשי שכתב מנהל עמותה, לצורך הקמת עמותה וקמפיין גיוס בפלטפורמת "המונים".

חוקים מחייבים:
1. אתה מחלץ אך ורק מה שכתוב בפועל בטקסט. אסור להמציא, להשלים או לנחש פרטים שלא נמסרו — אם משהו לא מופיע בטקסט, החזר null (או מערך ריק לשדות מסוג רשימה).
2. מספר עמותה (organizationNumber): מלא רק אם מופיע בטקסט מספר מפורש שנראה כמו מספר רישום עמותה/מלכ"ר. אל תנחש מספר, אל תמציא אחד, ואל תשתמש בטעות במספר אחר (כמו סכום כסף או מספר טלפון).
3. הבחן בין שם העמותה (הארגון) לבין שם/מטרת הקמפיין הספציפי — לפעמים אלה זהים, לפעמים לא. אם רק אחד מהם מוזכר, מלא רק אותו.
4. יעד גיוס כספי (suggestedTargetAmount): מלא רק אם מוזכר סכום מפורש בטקסט. אל תציע סכום מדעתך, גם אם נראה "סביר" לפי סוג הקמפיין.
5. אם הטקסט קצר מדי או לא מכיל מספיק מידע — מלא null/מערך ריק בשדות הרלוונטיים. אל תמלא אותם בניחוש רק כדי "להיראות שלם".
6. כתוב בעברית בכל שדה טקסטואלי (organizationDescription, suggestedTitle, suggestedShortDescription), אלא אם הטקסט המקורי עצמו כתוב בשפה אחרת — במקרה כזה שמור על אותה שפה.
7. suggestedTitle עד 80 תווים, suggestedShortDescription עד 160 תווים.
8. socialLinks: כלול אך ורק כתובות URL מפורשות שמופיעות ממש כטקסט רציף בטקסט (מתחילות ב-http/https/www — למשל "https://example.org" או "www.example.org"). אסור בשום מקרה לבנות/להרכיב/לנחש כתובת URL משם עמוד, שם ארגון, או כל טקסט אחר שאינו כתובת מלאה כפי שהיא. דוגמה שגויה (אל תעשה זאת): הטקסט אומר "יש לנו עמוד פייסבוק בשם 'כנפיים של תקווה'" ← זו **לא** כתובת URL, ולכן socialLinks צריך להישאר [] — גם אם נדמה לך שאתה יכול לנחש/להרכיב כתובת פייסבוק סבירה מהשם. דוגמה נכונה: הטקסט אומר "האתר שלנו: https://example.org" ← socialLinks: ["https://example.org"].
9. categoryGuess: כלול רק קטגוריות שיש להן תימוכין ישיר וברור בטקסט. אל תוסיף קטגוריה על סמך הֶקְשֵר עקיף או שיוך כללי לתחום (למשל אל תוסיף "יולדות" רק כי הטקסט עוסק בילדים).
10. organizationName: מלא כל שם ספציפי שמופיע בטקסט לעמותה/ארגון/מוסד — כולל שם בתוך מירכאות שמופיע אחרי מילת קטגוריה כללית כמו "עמותת X", "בית הכנסת X", "עמותה בשם X". דוגמאות נכונות: "עמותת לב אחד" ← organizationName: "לב אחד". 'בית הכנסת "אוהל יעקב"' ← organizationName: "אוהל יעקב" (או "בית הכנסת אוהל יעקב" — השם המלא כפי שמופיע). מלא null **רק** כשאין שום שם קונקרטי בטקסט בכלל — הטקסט מתאר את הארגון תיאור כללי בלבד ("אנחנו עמותה ש...", "אנחנו קבוצת מתנדבים ש...") בלי לתת שם בשום צורה. במקרה כזה אל תחזיר את המילה הכללית "עמותה"/"ארגון" עצמה כאילו היא שם. **חשוב: הכלל הזה חל אך ורק על שדה organizationName עצמו. המשך למלא את שאר השדות (organizationDescription, categoryGuess, suggestedTitle וכו') כרגיל מכל מידע אמיתי שכן קיים בטקסט, גם כשאין שם ספציפי לעמותה.** חוסר בשם אחד אינו סיבה להחזיר null בשדות אחרים שיש להם תוכן ממשי בטקסט.

החזר אך ורק JSON תקני בצורה הבאה, בלי טקסט נוסף ובלי הסברים:
{
  "organizationName": "string או null",
  "organizationNumber": "string או null",
  "entityTypeGuess": "string או null",
  "categoryGuess": ["מחרוזת", "..."],
  "organizationDescription": "string או null",
  "suggestedTitle": "string או null",
  "suggestedShortDescription": "string או null",
  "suggestedTargetAmount": "number או null",
  "socialLinks": ["url", "..."],
  "contactEmail": "string או null",
  "contactPhone": "string או null"
}`;

// @param {string} text - Raw free text the user wrote.
// @returns {string}
exports.buildExtractionPrompt = (text) => {
  return `הטקסט שכתב המשתמש:\n${text}`;
};

exports.SYSTEM_PROMPT = SYSTEM_PROMPT;
