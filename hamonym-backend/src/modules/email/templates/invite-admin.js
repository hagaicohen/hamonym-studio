const { wrapHtml } = require('./_layout');

module.exports = (data) => {
  const { fullName, resetUrl } = data;
  const name = fullName || '';

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">הוזמנת כמנהל פלטפורמה</h2>
    <p style="color:#475569;line-height:1.6;">שלום ${name},<br>נוצר עבורך חשבון ניהול פלטפורמה במערכת המונים. יש לקבוע סיסמה כדי להתחיל.</p>
    <a href="${resetUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">קביעת סיסמה</a>
  `);

  const text = `שלום ${name},

נוצר עבורך חשבון ניהול פלטפורמה במערכת המונים. יש לקבוע סיסמה כדי להתחיל:

${resetUrl}`;

  return { subject: 'הוזמנת כמנהל פלטפורמה — המונים', html, text };
};
