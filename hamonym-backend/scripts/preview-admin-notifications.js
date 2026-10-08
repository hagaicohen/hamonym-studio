// Local preview of the admin/ops notification emails (2026-10-07, Admin
// Notifications P0 — step 5 "local preview validation").
//
// WHY A SEPARATE SCRIPT FROM scripts/send-test-email.js: that script's whole
// contract is "one explicit --to address you control, never resolved from the
// database" — correct for donor/entity templates. Admin alerts are defined by
// their recipient being THE SUPER ADMIN, resolved from `users`, and their
// data shape is per-EVENT, not per-template (four of the eight events share
// one template and differ only in payload). So this renders the 8 events, one
// preview file each, without touching the recipient-safety rules of the other
// script.
//
// WHAT IT NEVER DOES: no donation, no payment, no webhook, no entity
// deletion, no job run, no reconciliation finding, no row in any business
// table. It renders templates from hard-coded synthetic data and writes HTML
// files. It does not even resolve a recipient (no `users` read) — rendering
// is done directly, so nothing can be mailed to anyone.
//
// Usage (the preview flag only ever affects the stub provider, see
// email.service.js's devPreview comment — EMAIL_ENABLED stays false):
//   EMAIL_DEV_PREVIEW=true EMAIL_PROVIDER=stub node scripts/preview-admin-notifications.js
//
// Output: tmp/email-previews/<event>-<template>.html  (plus the subject line
// of each printed to stdout, since the subject is half the scan value).

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const templates = require('../src/modules/email/templates');
// The policy is read from the real service so a preview can never drift from
// what production would actually render. That import pulls in the shared pg
// pool (src/db/db.js warms itself up on require), so the script closes it at
// the end — same convention as scripts/send-test-email.js. No query of its
// own is ever issued here.
const pool = require('../src/db/db');
const { EVENT_POLICY } = require('../src/modules/email/admin-notification.service');

const PREVIEW_DIR = path.join(__dirname, '..', 'tmp', 'email-previews');

// Obviously-synthetic data only — fake ids, fake names, 'ZZZ' markers — so a
// preview can never be mistaken for a real incident report about a real
// donation, entity or donor.
const SAMPLES = {
  job_run_failed: {
    jobName: 'stale-pending-donations',
    jobRunId: 999001,
    failedAt: '2026-10-07T09:14:00.000Z',
    durationMs: 4213,
    triggeredBy: 'render-cron',
    error: 'ZZZ SYNTHETIC: getaddrinfo ENOTFOUND secure.cardcom.solutions',
  },
  scheduler_stale: {
    scope: 'scheduler',
    lastHeartbeatAt: '2026-10-06T21:00:00.000Z',
    minutesSinceLastHeartbeat: 735,
    toleranceMinutes: 30,
  },
  gate_v1_mismatch: {
    findingId: 999002,
    findingType: 'gate_v1_mismatch',
    jobName: 'payment_verification_gate',
    subjectType: 'donation',
    subjectId: '00000000-0000-0000-0000-00000000d001',
    foundAt: '2026-10-07T09:20:00.000Z',
    details: { reasons: ['webhook_low_profile_id_mismatch'] },
  },
  pending_donation_missing_low_profile_id: {
    findingId: 999003,
    findingType: 'pending_donation_missing_low_profile_id',
    jobName: 'stale-pending-donations',
    subjectType: 'donation',
    subjectId: '00000000-0000-0000-0000-00000000d002',
    foundAt: '2026-10-07T08:00:00.000Z',
    details: {
      campaignId: '00000000-0000-0000-0000-00000000c001',
      entityId: '00000000-0000-0000-0000-00000000e001',
      ageHours: 7,
    },
  },
  webhook_recovery_unresolved: {
    webhookEventId: 999004,
    recordType: 'DetailRecurring',
    outcome: 'failed',
    error: 'ZZZ SYNTHETIC: recurring instruction not found for RecurringId',
    receivedAt: '2026-10-06T18:40:00.000Z',
    attemptedAt: '2026-10-07T09:30:00.000Z',
  },
  stuck_recurring_signup: {
    findingId: 999005,
    findingType: 'stuck_recurring_signup',
    jobName: 'stuck-recurring-signups',
    subjectType: 'recurring_instruction',
    subjectId: '00000000-0000-0000-0000-00000000r001',
    foundAt: '2026-10-07T07:00:00.000Z',
    details: {
      instructionStatus: 'pending_creation',
      paidDonationId: '00000000-0000-0000-0000-00000000d003',
      entityId: '00000000-0000-0000-0000-00000000e001',
    },
  },
  recurring_unexplained_inactive: {
    findingId: 999006,
    findingType: 'recurring_unexplained_inactive',
    jobName: 'master_recurring_webhook',
    subjectType: 'recurring_instruction',
    subjectId: '00000000-0000-0000-0000-00000000r002',
    foundAt: '2026-10-07T09:45:00.000Z',
    details: {
      previousStatus: 'active',
      cardcomRecurringId: -1234567,
      entityId: '00000000-0000-0000-0000-00000000e001',
      campaignId: '00000000-0000-0000-0000-00000000c001',
    },
  },
  entity_hard_deleted: {
    entityId: '00000000-0000-0000-0000-00000000e002',
    entityName: 'ZZZ_TEST עמותת בדיקה (סינתטי)',
    actingAdminId: 9,
    auditLogId: 999007,
    deletedAt: '2026-10-07T10:00:00.000Z',
    notes: 'ZZZ SYNTHETIC — אין כאן מחיקה אמיתית',
  },
};

// The one extra variant worth seeing: scheduler_stale renders materially
// different content for scope='job'.
const EXTRA_VARIANTS = {
  'scheduler_stale-job-scope': {
    eventType: 'scheduler_stale',
    data: {
      scope: 'job',
      jobName: 'webhook-recovery',
      lastSuccessAt: '2026-10-07T06:00:00.000Z',
      minutesSinceLastSuccess: 225,
    },
  },
};

function render(eventType, data) {
  const policy = EVENT_POLICY[eventType];
  if (!policy) throw new Error(`no policy for ${eventType}`);
  const templateFn = templates[policy.template];
  if (!templateFn) throw new Error(`no template ${policy.template}`);
  return {
    template: policy.template,
    ...templateFn({ ...data, eventType, severity: data.severity || policy.severity }),
  };
}

function write(name, template, subject, html) {
  const file = path.join(PREVIEW_DIR, `${name}-${template}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

function main() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  console.log(`EMAIL_ENABLED=${process.env.EMAIL_ENABLED} EMAIL_PROVIDER=${process.env.EMAIL_PROVIDER} EMAIL_DEV_PREVIEW=${process.env.EMAIL_DEV_PREVIEW}`);
  console.log('(nothing is sent and no recipient is resolved — templates are rendered directly)\n');

  const missing = Object.keys(EVENT_POLICY).filter((e) => !SAMPLES[e]);
  if (missing.length) {
    console.error(`No sample data for: ${missing.join(', ')} — add it to SAMPLES rather than improvising here.`);
    process.exitCode = 1;
    return;
  }

  for (const [eventType, data] of Object.entries(SAMPLES)) {
    const { template, subject, html, text } = render(eventType, data);
    const file = write(eventType, template, subject, html);
    console.log(`${eventType}\n  template: ${template}\n  subject : ${subject}\n  file    : ${file}`);
    // Leak check at the preview level too (the real assertions live in
    // scripts/test-admin-ops-notifications.js).
    for (const forbidden of ['cardcom_api_password', 'ApiPassword', 'terminal_number', 'RESEND_API_KEY']) {
      if (html.includes(forbidden) || text.includes(forbidden)) {
        console.error(`  !! LEAK: rendered output contains "${forbidden}"`);
        process.exitCode = 1;
      }
    }
  }

  for (const [name, { eventType, data }] of Object.entries(EXTRA_VARIANTS)) {
    const { template, subject, html } = render(eventType, data);
    const file = write(name, template, subject, html);
    console.log(`${name}\n  template: ${template}\n  subject : ${subject}\n  file    : ${file}`);
  }

  console.log(`\n${Object.keys(SAMPLES).length} event previews + ${Object.keys(EXTRA_VARIANTS).length} variant written to ${PREVIEW_DIR}`);
}

try {
  main();
} finally {
  pool.end();
}
