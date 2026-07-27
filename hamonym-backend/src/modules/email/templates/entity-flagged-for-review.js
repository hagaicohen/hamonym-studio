const { wrapHtml } = require('./_layout');

module.exports = (data) => {
  const { entityName, reason, entityUrl } = data;

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">עמותה פעילה דורשת בדיקה חוזרת</h2>
    <p style="color:#475569;line-height:1.6;">
      ב<strong>${entityName}</strong> — עמותה שכבר אושרה — השתנה פרט רגיש מאז האישור המקורי:
    </p>
    <p style="margin:12px 0;padding:12px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;font-weight:700;">
      ${reason}
    </p>
    <a href="${entityUrl}" style="display:inline-block;margin-top:8px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
      לצפייה בעמותה
    </a>
  `);

  const text = `עמותה פעילה דורשת בדיקה חוזרת

${entityName} — עמותה שכבר אושרה — השתנה פרט רגיש מאז האישור המקורי:
${reason}

לצפייה בעמותה: ${entityUrl}`;

  return { subject: `דורש בדיקה חוזרת — ${entityName}`, html, text };
};
