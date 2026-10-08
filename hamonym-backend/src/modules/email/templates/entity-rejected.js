const { wrapHtml } = require('./_layout');

// `reason` is OPTIONAL and is only ever the approval-decision note that the
// entity's own Settings page already shows it (entities.service.js
// #getApprovalStatus -> `comment`, filtered by APPROVAL_DECISION_ACTIONS).
// It is NOT a free pass for internal admin notes: platform_audit_log is a
// shared audit trail whose non-decision rows have already leaked internal
// billing notes onto a user-facing screen once (see that filter's comment),
// so the caller resolves it through the exact same filtered lookup and
// passes nothing at all if there is no decision note. With no reason, this
// becomes a neutral "requires attention / contact us" email rather than an
// invented explanation.
module.exports = (data) => {
  const { entityName, reason, settingsUrl, supportEmail } = data;
  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

  const reasonHtml = cleanReason
    ? `<div style="margin:16px 0;padding:14px 16px;background:#f8fafc;border-right:3px solid #583cd6;border-radius:6px;color:#334155;line-height:1.6;white-space:pre-wrap;">${cleanReason}</div>`
    : `<p style="color:#475569;line-height:1.6;">לפרטים על הבקשה ולהמשך טיפול אפשר לפנות אלינו.</p>`;

  const reasonText = cleanReason
    ? `\n${cleanReason}\n`
    : '\nלפרטים על הבקשה ולהמשך טיפול אפשר לפנות אלינו.\n';

  const contactHtml = supportEmail
    ? `<p style="color:#94a3b8;font-size:12px;margin-top:16px;">ליצירת קשר: ${supportEmail}</p>`
    : '';
  const contactText = supportEmail ? `\nליצירת קשר: ${supportEmail}` : '';

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">הבקשה דורשת טיפול</h2>
    <p style="color:#475569;line-height:1.6;">
      בקשת ההצטרפות של <strong>${entityName}</strong> למערכת המונים לא אושרה בשלב זה.
    </p>
    ${reasonHtml}
    <a href="${settingsUrl}" style="display:inline-block;margin-top:8px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
      לצפייה בסטטוס הבקשה
    </a>
    ${contactHtml}
  `);

  const text = `הבקשה דורשת טיפול — ${entityName}

בקשת ההצטרפות של ${entityName} למערכת המונים לא אושרה בשלב זה.
${reasonText}
לצפייה בסטטוס הבקשה:
${settingsUrl}${contactText}`;

  return { subject: `עדכון בבקשת ההצטרפות של ${entityName}`, html, text };
};
