const { wrapHtml } = require('./_layout');

module.exports = (data) => {
  const { entityName, acceptUrl } = data;

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">הוזמנת לנהל עמוד עסקי</h2>
    <p style="color:#475569;line-height:1.6;">שלום,<br>הוזמנת לערוך את העמוד העסקי של <strong>${entityName}</strong> במערכת המונים. לחצו על הכפתור כדי להצטרף.</p>
    <a href="${acceptUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">הצטרפות</a>
  `);

  const text = `שלום,

הוזמנת לערוך את העמוד העסקי של ${entityName} במערכת המונים:

${acceptUrl}`;

  return { subject: `הוזמנת לנהל את העמוד העסקי של ${entityName} — המונים`, html, text };
};
