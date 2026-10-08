const db = require('../../db/db');
const templates = require('./templates');

function getProvider() {
  const name = process.env.EMAIL_PROVIDER || 'stub';
  switch (name) {
    case 'resend':
      return require('./providers/resend.provider');
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

// Idempotency claim (2026-10-05, migration 070) — only for callers that
// pass an `idempotencyKey`. The row is inserted BEFORE the provider call,
// as status='pending', so the key is consumed atomically by whichever
// concurrent redelivery gets there first; the loser gets `duplicate` back
// and sends nothing. The unique index is the guarantee, not a prior SELECT.
//
// Every legacy/unkeyed caller (receipt, reset-password, invite-admin,
// invite-partner-editor, entity-flagged-for-review, billing-setup-required)
// keeps the original log-AFTER-send behavior untouched — idempotency_key
// stays NULL for them and Postgres treats NULLs as distinct.
async function claimKeyedLog(payload, subject, providerName) {
  const { template, to, data = {}, entityId, campaignId, donationId, userId, idempotencyKey } = payload;
  const res = await db.query(
    `INSERT INTO email_logs
       (to_email, template, subject, status, provider,
        entity_id, campaign_id, donation_id, user_id, idempotency_key, payload)
     VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      to, template, subject || null, providerName,
      entityId || null, campaignId || null, donationId || null, userId || null,
      idempotencyKey,
      JSON.stringify({ template, to, data, entityId: entityId || null, campaignId: campaignId || null, donationId: donationId || null, userId: userId || null }),
    ]
  );
  return res.rows[0]?.id ?? null;
}

async function finalizeKeyedLog(logId, { status, providerMessageId, error, sent }) {
  await db.query(
    `UPDATE email_logs
     SET status = $2, provider_message_id = $3, error = $4, sent_at = $5
     WHERE id = $1`,
    [logId, status, providerMessageId || null, error || null, sent ? new Date() : null]
  );
}

// Performs the actual provider call for an already-persisted intent and
// records the terminal status. Shared by dispatch() and by
// email-dispatch-recovery.job.js, so a recovered send is byte-identical to
// a first-attempt one (same precedent as webhook-recovery.job.js re-running
// the very same handler, rather than a parallel recovery implementation).
async function attemptSend({ to, subject, html, text, template }, providerName) {
  const provider = getProvider();
  const result = await provider.send({
    to, subject, html, text, template,
    from: process.env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO,
  });
  return {
    status: result.stub ? 'stub' : 'sent',
    providerMessageId: result.providerMessageId,
  };
}

// Returns { status } -- 'disabled' | 'sent' | 'stub' | 'failed' | 'duplicate'
// | 'unknown_template'
// -- so a caller that actually needs to know the outcome (e.g. billing-
// setup-notification.service.js, which must not treat a non-delivery as a
// permanently consumed notification) can use the awaited exports.send
// variant below instead of the fire-and-forget exports.queue. Every
// existing queue() call site is unaffected -- it already ignored dispatch's
// return value.
//
// 'duplicate' is only ever returned to a caller that passed an
// idempotencyKey, so no pre-existing caller can start seeing it.
async function dispatch(payload) {
  const { template, to, data = {}, entityId, campaignId, donationId, userId, idempotencyKey } = payload;
  const providerName = process.env.EMAIL_PROVIDER || 'stub';

  const templateFn = templates[template];
  if (!templateFn) {
    console.error(`[EmailService] unknown template: ${template}`);
    return { status: 'unknown_template' };
  }

  const { subject, html, text } = templateFn(data);
  const enabled = process.env.EMAIL_ENABLED === 'true';

  // Dev-only local preview (2026-10-06): lets the full dispatch path run
  // through the stub provider -- which writes the rendered HTML to
  // tmp/email-previews/, see stub.provider.js -- while hamonym.com's Resend
  // domain isn't verified yet and EMAIL_ENABLED stays false everywhere.
  // Deliberately restricted to providerName === 'stub': EMAIL_DEV_PREVIEW
  // can never be the thing that makes a real provider send, so it is safe
  // even if someone leaves it set in an environment that also has
  // EMAIL_PROVIDER=resend -- that combination still hits the `!enabled`
  // branch below exactly as before. EMAIL_ENABLED remains the only kill
  // switch for anything that actually leaves the process.
  const devPreview = process.env.EMAIL_DEV_PREVIEW === 'true' && providerName === 'stub';

  let logId = null;
  if (idempotencyKey) {
    logId = await claimKeyedLog(payload, subject, providerName);
    if (!logId) return { status: 'duplicate' };
  }

  // EMAIL_ENABLED stays exactly the kill switch it has always been: nothing
  // below this point runs, and no provider is even loaded, until it is
  // explicitly 'true'. For a keyed email the claim above is deliberately
  // NOT released on 'disabled' — the same "attempt once, record the truth,
  // never retroactively retry" semantics billing_setup_notifications
  // already settled on (see its service header). Flipping EMAIL_ENABLED to
  // true in production must not back-fill a flood of emails about events
  // that happened weeks earlier.
  if (!enabled && !devPreview) {
    if (logId) await finalizeKeyedLog(logId, { status: 'disabled' });
    else await logEmail({ to, template, subject, status: 'disabled', provider: providerName, entityId, campaignId, donationId, userId });
    return { status: 'disabled' };
  }

  try {
    const { status, providerMessageId } = await attemptSend({ to, subject, html, text, template }, providerName);
    if (logId) await finalizeKeyedLog(logId, { status, providerMessageId, sent: true });
    else {
      await logEmail({
        to, template, subject,
        status,
        provider: providerName,
        providerMessageId,
        entityId, campaignId, donationId, userId,
        sent: true,
      });
    }
    return { status, providerMessageId };
  } catch (err) {
    if (logId) await finalizeKeyedLog(logId, { status: 'failed', error: err.message });
    else await logEmail({ to, template, subject, status: 'failed', provider: providerName, error: err.message, entityId, campaignId, donationId, userId });
    return { status: 'failed', error: err.message };
  }
}

// Re-runs one stranded keyed intent (status='pending', payload stored by
// claimKeyedLog). Does NOT re-claim the key — the row already owns it;
// re-dispatching through dispatch() would just come back 'duplicate'.
// Used only by email-dispatch-recovery.job.js.
async function redispatchPending(row) {
  const intent = row.payload || {};
  const templateFn = templates[intent.template];
  if (!templateFn) {
    await finalizeKeyedLog(row.id, { status: 'failed', error: `unknown template: ${intent.template}` });
    return { status: 'unknown_template' };
  }

  const { subject, html, text } = templateFn(intent.data || {});
  if (process.env.EMAIL_ENABLED !== 'true') {
    await finalizeKeyedLog(row.id, { status: 'disabled' });
    return { status: 'disabled' };
  }

  try {
    const { status, providerMessageId } = await attemptSend(
      { to: intent.to, subject, html, text },
      process.env.EMAIL_PROVIDER || 'stub'
    );
    await finalizeKeyedLog(row.id, { status, providerMessageId, sent: true });
    return { status, providerMessageId };
  } catch (err) {
    await finalizeKeyedLog(row.id, { status: 'failed', error: err.message });
    return { status: 'failed', error: err.message };
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
exports.redispatchPending = redispatchPending;
