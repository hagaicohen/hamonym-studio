const { wrapHtml } = require('./_layout');

module.exports = (data) => {
  const { donorName, receiptNumber, amount, campaignTitle, entityName, receiptUrl } = data;
  const amountFmt = `₪${Math.round(Number(amount) || 0).toLocaleString('he-IL')}`;

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">תודה על תרומתך, ${donorName}!</h2>
    <p style="color:#475569;line-height:1.6;">התרומה שלך בסך <strong>${amountFmt}</strong> לקמפיין <strong>${campaignTitle}</strong> (${entityName}) התקבלה בהצלחה.</p>
    <p style="color:#475569;">מספר קבלה: <strong>${receiptNumber}</strong></p>
    <a href="${receiptUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">צפייה בקבלה</a>
  `);

  const text = `תודה על תרומתך, ${donorName}!

התרומה שלך בסך ${amountFmt} לקמפיין ${campaignTitle} (${entityName}) התקבלה בהצלחה.
מספר קבלה: ${receiptNumber}

צפייה בקבלה: ${receiptUrl}`;

  return {
    subject: `קבלה על תרומתך ל${campaignTitle}`,
    html,
    text,
  };
};
