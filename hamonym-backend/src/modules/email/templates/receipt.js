const { wrapHtml } = require('./_layout');

// Wording corrected 2026-10-05 (Pilot Email P0, Step 3): this email used to
// call itself a "קבלה". What /receipts/:id actually renders is Hamonym's own
// internal donation-confirmation page — CardCom's Document webhook handler
// is still a no-op stub (payment/handlers/document.handler.js), so no
// official accounting/tax document is produced or referenced by this flow.
// Neutral term only: "אישור תרומה". Do not reintroduce "קבלה", "קבלה
// מוכרת", "חשבונית", or any reference to סעיף 46 here unless a real
// accounting document is actually attached to it.
//
// `receiptNumber` / `receiptUrl` keep their names: they are the DB column
// (receipts.receipt_number) and the existing frontend route, and renaming
// them is a schema/route change, not a copy change.
module.exports = (data) => {
  const { donorName, receiptNumber, amount, campaignTitle, entityName, receiptUrl } = data;
  const amountFmt = `₪${Math.round(Number(amount) || 0).toLocaleString('he-IL')}`;

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">תודה על תרומתך, ${donorName}!</h2>
    <p style="color:#475569;line-height:1.6;">התרומה שלך בסך <strong>${amountFmt}</strong> לקמפיין <strong>${campaignTitle}</strong> (${entityName}) התקבלה בהצלחה.</p>
    <p style="color:#475569;">מספר אישור: <strong>${receiptNumber}</strong></p>
    <a href="${receiptUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">צפייה באישור התרומה</a>
  `);

  const text = `תודה על תרומתך, ${donorName}!

התרומה שלך בסך ${amountFmt} לקמפיין ${campaignTitle} (${entityName}) התקבלה בהצלחה.
מספר אישור: ${receiptNumber}

צפייה באישור התרומה: ${receiptUrl}`;

  return {
    subject: `אישור תרומה ל${campaignTitle}`,
    html,
    text,
  };
};
