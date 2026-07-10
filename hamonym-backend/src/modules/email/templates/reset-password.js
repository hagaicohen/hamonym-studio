const { wrapHtml } = require('./_layout');

module.exports = (data) => {
  const { fullName, resetUrl } = data;
  const name = fullName || '';

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">איפוס סיסמה</h2>
    <p style="color:#475569;line-height:1.6;">שלום ${name},<br>קיבלנו בקשה לאיפוס הסיסמה שלך. הקישור בתוקף ל-24 שעות.</p>
    <a href="${resetUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">איפוס סיסמה</a>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px;">אם לא ביקשת זאת, ניתן להתעלם מהודעה זו.</p>
  `);

  const text = `שלום ${name},

קיבלנו בקשה לאיפוס הסיסמה שלך. הקישור בתוקף ל-24 שעות.

${resetUrl}

אם לא ביקשת זאת, ניתן להתעלם מהודעה זו.`;

  return { subject: 'איפוס סיסמה — המונים', html, text };
};
