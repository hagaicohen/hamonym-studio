const fs = require('fs');
const path = require('path');

// Does not send anything — logs the outcome as 'stub' so callers, and
// email_logs, behave exactly as they will with a real provider. Set
// EMAIL_PROVIDER=resend (see providers/resend.provider.js) to actually send.
//
// Dev-only preview (2026-10-06): when EMAIL_DEV_PREVIEW=true, also writes
// the exact rendered HTML — the same payload a real provider would have
// received — to tmp/email-previews/ so it can be opened in a browser while
// there is no verified Resend domain yet. Gated here, not in email.service,
// so it can never run against a real provider: dispatch() only bypasses the
// EMAIL_ENABLED kill switch when the active provider is this stub (see its
// own comment). Nothing here affects what gets sent to Resend in production.
const PREVIEW_DIR = path.join(__dirname, '..', '..', '..', '..', 'tmp', 'email-previews');

function writePreview({ template, subject, html }) {
  try {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    const slug = String(template || 'email').replace(/[^a-z0-9-_]/gi, '-');
    const file = path.join(PREVIEW_DIR, `${slug}-${Date.now()}.html`);
    fs.writeFileSync(file, html || `<pre>${subject}</pre>`, 'utf8');
    console.log(`[EmailService:stub] preview written: ${file}`);
  } catch (err) {
    console.error('[EmailService:stub] failed to write preview:', err.message);
  }
}

exports.send = async ({ to, subject, html, template }) => {
  console.log(`[EmailService:stub] would send "${subject}" to ${to}`);
  if (process.env.EMAIL_DEV_PREVIEW === 'true') writePreview({ template, subject, html });
  return { providerMessageId: null, stub: true };
};
