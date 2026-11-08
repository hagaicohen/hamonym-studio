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
  if (data.lang === 'en') return english(data);
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

// The same notice in English, for a donor who donated through the English
// version of the campaign (donations.donor_language, migration 089). Same facts,
// same rules: nothing about cancellation or retry timing.
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function english(data) {
  const { donorName, campaignTitle, entityName, amount, failedAtDisplay, supportEmail } = data;
  const amountFmt = amount != null && Number(amount) > 0 ? `₪${Math.round(Number(amount)).toLocaleString('en-US')}` : null;
  const greeting = donorName ? `Hello ${donorName},` : 'Hello,';
  const forWhat = entityName ? `${campaignTitle} (${entityName})` : campaignTitle;
  const amountClause = amountFmt ? ` of <strong>${amountFmt}</strong>` : '';
  const amountClauseText = amountFmt ? ` of ${amountFmt}` : '';
  const dateClause = failedAtDisplay ? ` on ${failedAtDisplay}` : '';
  const contactHtml = supportEmail ? `<p style="color:#94a3b8;font-size:12px;margin-top:16px;">Questions? Write to us: ${supportEmail}</p>` : '';
  const contactText = supportEmail ? `\nQuestions? Write to us: ${supportEmail}` : '';
  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">Your monthly donation was not charged</h2>
    <p style="color:#475569;line-height:1.6;">${escapeHtml(greeting)}</p>
    <p style="color:#475569;line-height:1.6;">
      The charge attempt for your recurring donation to <strong>${escapeHtml(forWhat)}</strong>${amountClause}${dateClause} did not go through.
    </p>
    <p style="color:#475569;line-height:1.6;">
      Your standing order has not been cancelled. To keep supporting, please check with your bank or card issuer
      that your payment method is valid and has available credit.
    </p>
    ${contactHtml}
  `, 'en');
  const text = `Your monthly donation was not charged

${greeting}

The charge attempt for your recurring donation to ${forWhat}${amountClauseText}${dateClause} did not go through.

Your standing order has not been cancelled. To keep supporting, please check with your bank or card issuer that your payment method is valid and has available credit.${contactText}`;
  return { subject: `The recurring donation to ${campaignTitle} was not charged`, html, text };
}
