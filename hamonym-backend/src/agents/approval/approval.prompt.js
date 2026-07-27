// Builds the prompt sent to the LLM from ApprovalChecks (see
// approval.checks.js and approval.types.js) — never from raw Facts or the
// ApprovalContext. Each check already carries a code-verified verdict
// (pass/warning/fail) and a one-line explanation; the LLM's job is to weigh
// already-judged checks and produce a recommendation, not to (re-)decide
// what each one means. This file doesn't know GuideStar, Documents, or
// Entity exist — only the uniform ApprovalCheck shape.

const SYSTEM_PROMPT = `אתה עוזר לסופר אדמין בפלטפורמת גיוס תרומות (המונים) להחליט האם לאשר עמותה חדשה.
קיבלת רשימת בדיקות שכבר בוצעו ונשקלו בקוד — לכל בדיקה יש סטטוס (pass/warning/fail) והסבר. המשימה שלך:
1. לשקלל את הבדיקות ולתת רמת ביטחון (confidence) בין 0 ל-100 לגבי מוכנות העמותה לאישור.
2. לתת המלצה קצרה וברורה — לאשר, לאשר בתנאי השלמת מסמכים, או לדחות ולציין למה.
3. לנסח את התוצאה בעברית טבעית, ברורה לסופר אדמין.

חשוב: אתה רק ממליץ. ההחלטה הסופית היא תמיד של הסופר אדמין האנושי. אתה לא קובע האם בדיקה עברה או נכשלה — זה כבר נקבע; תפקידך רק לשקלל ולהסביר.

החזר אך ורק JSON תקני בצורה הבאה, בלי טקסט נוסף:
{
  "summary": "רשימת הבדיקות בשורות טבעיות בעברית, כל שורה מתחילה ב-✔ (pass) או ⚠ (warning/fail)",
  "confidence": <מספר 0-100>,
  "recommendation": "משפט או שניים בעברית"
}`;

const STATUS_MARK = { pass: '✔', warning: '⚠', fail: '✗' };

// @param {string|null} entityName
// @param {import('./approval.types').ApprovalCheck[]} checks
// @returns {string}
exports.buildApprovalPrompt = (entityName, checks) => {
  const lines = checks
    .map((c) => `${STATUS_MARK[c.status]} ${c.title} [${c.status}]: ${c.explanation}`)
    .join('\n');

  return `עמותה: ${entityName || 'לא ידוע'}\n\nבדיקות:\n${lines}`;
};

exports.SYSTEM_PROMPT = SYSTEM_PROMPT;
