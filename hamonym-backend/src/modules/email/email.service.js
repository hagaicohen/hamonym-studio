const db = require('../../db/db');
const templates = require('./templates');

function getProvider() {
  const name = process.env.EMAIL_PROVIDER || 'stub';
  switch (name) {
    case 'stub':
    default:
      return require('./providers/stub.provider');
  }
}

async function logEmail({ to, template, subject, status, provider, providerMessageId, error, entityId, campaignId, donationId, userId, sent }) {
  await db.query(
    `INSERT INTO email_logs
       (to_email, template, subject, status, provider, provider_message_id, error,
        entity_id, campaign_id, donation_id, user_id, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      to, template, subject || null, status, provider || null, providerMessageId || null, error || null,
      entityId || null, campaignId || null, donationId || null, userId || null, sent ? new Date() : null,
    ]
  );
}

async function dispatch(payload) {
  const { template, to, data = {}, entityId, campaignId, donationId, userId } = payload;
  const providerName = process.env.EMAIL_PROVIDER || 'stub';

  const templateFn = templates[template];
  if (!templateFn) {
    console.error(`[EmailService] unknown template: ${template}`);
    return;
  }

  const { subject, html, text } = templateFn(data);
  const enabled = process.env.EMAIL_ENABLED === 'true';

  if (!enabled) {
    await logEmail({ to, template, subject, status: 'disabled', provider: providerName, entityId, campaignId, donationId, userId });
    return;
  }

  try {
    const provider = getProvider();
    const result = await provider.send({
      to, subject, html, text,
      from: process.env.EMAIL_FROM,
      replyTo: process.env.EMAIL_REPLY_TO,
    });
    await logEmail({
      to, template, subject,
      status: result.stub ? 'stub' : 'sent',
      provider: providerName,
      providerMessageId: result.providerMessageId,
      entityId, campaignId, donationId, userId,
      sent: true,
    });
  } catch (err) {
    await logEmail({ to, template, subject, status: 'failed', provider: providerName, error: err.message, entityId, campaignId, donationId, userId });
  }
}

// Fire-and-forget — callers never block/wait on email delivery, so a slow or
// down provider can never stall a donation/registration/admin-creation flow.
// If real retry/backoff is ever needed, this is the one place to swap in a
// real queue (BullMQ etc) — no call site anywhere else in the app changes.
exports.queue = (payload) => {
  setImmediate(() => {
    dispatch(payload).catch((err) => console.error('[EmailService] dispatch crashed:', err.message));
  });
};

// Awaited variant — for callers (tests, scripts) that need to know the outcome.
exports.send = dispatch;
