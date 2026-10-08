// Controlled single test send (2026-10-05, Pilot Email P0 / Step 2).
//
// WHY A SCRIPT AND NOT A ROUTE: a test-send HTTP endpoint — even an
// authenticated Super-Admin one — is a permanently reachable surface that
// can be made to deliver attacker-chosen content to an attacker-chosen
// address. A one-off script run by whoever already has shell/DB access adds
// no new surface at all, and matches this repo's existing convention
// (scripts/test-*.js, scripts/set-entity-cardcom.js, …).
//
// WHAT IT NEVER DOES: no donation, no payment, no entity approval, no
// recurring instruction, no row in any business table. It renders one
// template and hands it to the email service. The only row it writes is the
// email_logs row the service itself writes, which the script prints and
// does NOT clean up (it is the evidence).
//
// EMAIL_ENABLED is NOT touched. The script reads the real environment:
//   EMAIL_ENABLED=false (today's value) -> logs 'disabled', sends nothing.
//   EMAIL_PROVIDER=stub (today's value) -> no network call even if enabled.
// To actually reach Resend you must supply BOTH overrides for this one
// process only, never in .env and never in Render:
//   EMAIL_ENABLED=true EMAIL_PROVIDER=resend RESEND_API_KEY=... \
//     node scripts/send-test-email.js --to=<address> --template=receipt
//
// RECIPIENT SAFETY: --to is mandatory and must be supplied explicitly. The
// script refuses to resolve a recipient out of the database (no donor, no
// entity admin, no user row is ever read), so it cannot email a real donor
// or entity manager by accident.
//
// Usage:
//   node scripts/send-test-email.js --to=you@example.com
//   node scripts/send-test-email.js --to=you@example.com --template=entity-approved
//   node scripts/send-test-email.js --to=you@example.com --template=recurring-payment-failed
//   node scripts/send-test-email.js --render-only --template=entity-rejected

require('dotenv').config();
const pool = require('../src/db/db');
const emailService = require('../src/modules/email/email.service');
const templates = require('../src/modules/email/templates');

const FRONT = process.env.FRONTEND_URL || 'http://localhost:4200';

// Obviously-synthetic sample data only. No real names, no real amounts, no
// DB lookups — a test send must never be mistaken for a real notification
// about a real donation or a real association.
const SAMPLES = {
  receipt: {
    donorName: 'בדיקה',
    receiptNumber: 'TEST-0000',
    amount: 18,
    campaignTitle: 'קמפיין בדיקה',
    entityName: 'עמותת בדיקה',
    receiptUrl: `${FRONT}/receipts/00000000-0000-0000-0000-000000000000`,
  },
  'entity-approved': {
    entityName: 'עמותת בדיקה',
    dashboardUrl: `${FRONT}/dashboard`,
    hadPendingCampaigns: true,
  },
  'entity-rejected': {
    entityName: 'עמותת בדיקה',
    reason: 'טקסט בדיקה בלבד — אין כאן החלטה אמיתית.',
    settingsUrl: `${FRONT}/settings/entities/00000000-0000-0000-0000-000000000000`,
    supportEmail: process.env.EMAIL_REPLY_TO || null,
  },
  'recurring-payment-failed': {
    donorName: 'בדיקה',
    campaignTitle: 'קמפיין בדיקה',
    entityName: 'עמותת בדיקה',
    amount: 18,
    failedAtDisplay: '05/10/2026',
    supportEmail: process.env.EMAIL_REPLY_TO || null,
  },
  'billing-setup-required': {
    entityName: 'עמותת בדיקה',
    donationCount: 1,
    grossAmount: 18,
    settingsUrl: `${FRONT}/settings/entities/00000000-0000-0000-0000-000000000000`,
  },
};

function arg(name) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
}

async function main() {
  const template = String(arg('template') || 'receipt');
  const to = arg('to');
  const renderOnly = arg('render-only') === true;

  if (!templates[template]) {
    console.error(`Unknown template "${template}". Known: ${Object.keys(templates).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (!SAMPLES[template]) {
    console.error(`No sample data defined for "${template}" — add one to SAMPLES rather than improvising data here.`);
    process.exitCode = 1;
    return;
  }

  if (renderOnly) {
    const { subject, text } = templates[template](SAMPLES[template]);
    console.log(`--- ${template} ---`);
    console.log(`subject: ${subject}`);
    console.log(text);
    return;
  }

  if (typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    console.error('--to=<address> is required (an explicit address you control). Refusing to pick a recipient.');
    console.error('Use --render-only to inspect a template without sending anything.');
    process.exitCode = 1;
    return;
  }

  console.log(`EMAIL_ENABLED=${process.env.EMAIL_ENABLED} EMAIL_PROVIDER=${process.env.EMAIL_PROVIDER}`);
  console.log(`RESEND_API_KEY present: ${process.env.RESEND_API_KEY ? 'yes' : 'no'}`);
  if (process.env.EMAIL_PROVIDER === 'resend' && !process.env.RESEND_API_KEY) {
    console.error('EMAIL_PROVIDER=resend but RESEND_API_KEY is not set in this process — the send would fail. Aborting.');
    process.exitCode = 1;
    return;
  }

  // Unkeyed on purpose: a test send must be repeatable, so it does not
  // consume an idempotency_key slot (see email.service.js / migration 070).
  const result = await emailService.send({
    template,
    to,
    data: SAMPLES[template],
  });

  console.log('result:', JSON.stringify(result));

  const log = await pool.query(
    `SELECT id, to_email, template, subject, status, provider, provider_message_id, error, created_at, sent_at
     FROM email_logs
     WHERE to_email = $1 AND template = $2
     ORDER BY created_at DESC LIMIT 1`,
    [to, template]
  );
  console.log('email_logs row:', JSON.stringify(log.rows[0], null, 2));
}

main()
  .catch((err) => {
    console.error('FATAL', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
