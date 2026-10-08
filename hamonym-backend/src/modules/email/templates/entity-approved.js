const { wrapHtml } = require('./_layout');

// Deliberately says nothing about which specific campaigns were published.
// platform.service.js#setStatus's initial approval may auto-publish any
// campaign whose publish_requested_at was set (campaigns.service.js
// #publishRequestedCampaigns) — enumerating them here would duplicate
// campaign-lifecycle knowledge in a template and would need updating every
// time that gating changes. One approval email, one neutral sentence.
module.exports = (data) => {
  const { entityName, dashboardUrl, hadPendingCampaigns } = data;

  const pendingLineHtml = hadPendingCampaigns
    ? `<p style="color:#475569;line-height:1.6;">קמפיינים שהוגשו לפרסום לפני האישור יכולים לעלות לאוויר מעתה.</p>`
    : '';
  const pendingLineText = hadPendingCampaigns
    ? '\nקמפיינים שהוגשו לפרסום לפני האישור יכולים לעלות לאוויר מעתה.\n'
    : '';

  const html = wrapHtml(`
    <h2 style="margin:0 0 12px;color:#0f172a;">הבקשה אושרה</h2>
    <p style="color:#475569;line-height:1.6;">
      החשבון של <strong>${entityName}</strong> אושר במערכת המונים ופעיל מעתה.
    </p>
    ${pendingLineHtml}
    <p style="color:#475569;line-height:1.6;">
      אפשר להיכנס לאזור הניהול ולהתחיל לעבוד.
    </p>
    <a href="${dashboardUrl}" style="display:inline-block;margin-top:8px;padding:12px 24px;background:#583cd6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
      לאזור הניהול
    </a>
  `);

  const text = `הבקשה אושרה — ${entityName}

החשבון של ${entityName} אושר במערכת המונים ופעיל מעתה.
${pendingLineText}
אפשר להיכנס לאזור הניהול ולהתחיל לעבוד:
${dashboardUrl}`;

  return { subject: `החשבון של ${entityName} אושר במערכת המונים`, html, text };
};
