const { wrapHtml } = require('./_layout');

// Donor-facing notice that ONE recurring charge attempt did not go through.
// Says nothing about the standing order being cancelled (it isn't — see
// detail-recurring.handler.js: a failed attempt is recorded, the
// recurring_instruction is untouched) and nothing about retry timing, which
// is CardCom's to decide and Hamonym does not know.
//
// `amount` is only rendered when the caller actually has an authoritative
// figure (CardCom's own Sum, or the instruction's own agreed amount) —
// never a guess.
module.exports = (data) => {
  const { donorName, campaignTitle, entityName, amount, failedAtDisplay, supportEmail } = data;

  const amountFmt = amount != null && Number(amount) > 0
    ? `₪${Math.round(Number(amount)).toLocaleString('he-IL')}`
    : null;

  const greeting = donorName ? `שלום ${donorName},` : 'שלום,';
  const forWhat = entityName ? `${campaignTitle} (${entityName})` : campaignTitle;
  const amountClause = amountFmt ? ` בסך <strong>${amountFmt}</strong>` : '';
  const amountClauseText = amountFmt ? ` בסך ${amountFmt}` : '';
  const dateClause = failedAtDisplay ? ` בתאריך ${failedAtDisplay}` : '';

  const contactHtml = supportEmail
    ? `<p style="color:#94a3b8;font-size:12px;margin-top:16px;">לכל שאלה אפשר לפנות אלינו: ${supportEmail}</p>`
    : '';
  const contactText = supportEmail ? `\nלכל שאלה אפשר לפנות אלינו: ${supportEmail}` : '';

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">חיוב התרומה החודשית לא בוצע</h2>
    <p style="color:#475569;line-height:1.6;">${greeting}</p>
    <p style="color:#475569;line-height:1.6;">
      ניסיון החיוב של התרומה המתמשכת שלך ל<strong>${forWhat}</strong>${amountClause}${dateClause} לא הושלם.
    </p>
    <p style="color:#475569;line-height:1.6;">
      ההוראה הקבועה שלך לא בוטלה. כדי להמשיך את התמיכה, כדאי לבדוק מול הבנק או חברת האשראי
      שאמצעי התשלום בתוקף ושיש בו מסגרת זמינה.
    </p>
    ${contactHtml}
  `);

  const text = `חיוב התרומה החודשית לא בוצע

${greeting}

ניסיון החיוב של התרומה המתמשכת שלך ל${forWhat}${amountClauseText}${dateClause} לא הושלם.

ההוראה הקבועה שלך לא בוטלה. כדי להמשיך את התמיכה, כדאי לבדוק מול הבנק או חברת האשראי שאמצעי התשלום בתוקף ושיש בו מסגרת זמינה.${contactText}`;

  return { subject: `חיוב התרומה המתמשכת ל${campaignTitle} לא בוצע`, html, text };
};
