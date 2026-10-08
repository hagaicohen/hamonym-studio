const db = require('../../db/db');
const emailService = require('./email.service');

// ─────────────────────────────────────────────────────────────────────────
// Admin/ops notifications — the ONE path from an operational event to a
// Super Admin's inbox (2026-10-07, Admin Notifications P0 slice).
//
// WHY ONE FUNCTION: before this, "an admin should know about X" was answered
// by the Platform Admin dashboard being open (Operational Policy 2026-08-16,
// see cardcom-ops.controller.js's own comment). Pushing a notification from
// each job/handler directly would scatter recipient resolution, template
// choice, idempotency and failure-swallowing across eight files. Every
// caller instead passes an event type and raw safe values; everything else
// is decided here.
//
// HARD GUARANTEES (asserted by scripts/test-admin-ops-notifications.js):
//  1. Observability only. queueAdminNotification() never throws, never
//     rejects, and never awaits anything in the caller's critical path, so a
//     failure to notify can never roll back or alter a payment, a donation,
//     a recurring instruction, webhook processing, a reconciliation result,
//     an entity status, a job result or a hard delete.
//  2. Fires only AFTER the event's own evidence is durably persisted. This
//     module never writes business state and never participates in a
//     caller's transaction — it reads `users` and writes `email_logs` only.
//  3. One email per real incident. Every caller supplies an `incidentKey`
//     derived from an already-committed row's identity (a job_runs id, a
//     reconciliation_findings id, a cardcom_webhook_events id, a
//     platform_audit_log id, a frozen heartbeat timestamp) — never from
//     "now", never from a loop counter. The key is suffixed per recipient
//     and handed to email_logs.idempotency_key (migration 070), so the
//     unique index — not a prior SELECT — is the guarantee. A re-run job, a
//     redelivered webhook, a repeated health evaluation or a dashboard
//     refresh therefore cannot produce a second email.
//  4. Nothing is sent from a GET/read path. Every call site is a write path
//     or a job handler; cardcom-ops.controller.js's health/alerts endpoints
//     stay side-effect-free and import nothing from this module.
//
// KNOWN LIMITATION (deliberately not solved here): if the email provider
// itself is down, the notification about it cannot arrive by email. Nothing
// in this slice adds Slack/SMS/webhook fallbacks — the evidence still lands
// in email_logs (status='failed') and in reconciliation_findings/job_runs,
// which the Platform Admin health screen already surfaces.
// ─────────────────────────────────────────────────────────────────────────

// Authoritative definition of "Super Admin" in this codebase: the
// users.is_super_admin boolean. Confirmed in code, not assumed — it is what
// platform.service.js filters on (`status === 'super_admin'` ->
// `u.is_super_admin = true`), what impersonation refuses to target
// (`target.is_super_admin`), and the broader half of
// entities.service.js#notifyAdminsEntityFlagged's eligibility rule.
//
// Deliberately NOT the wider `is_super_admin OR 'organizations' =
// ANY(platform_permissions)` rule that entity-flagged uses: that rule exists
// for one entity-approval-scoped alert. These are platform-infrastructure
// alerts (jobs, scheduler, payment gate, webhooks, hard deletes), so the
// recipient role is full Super Admin only. resolveEntityAdmins() from
// billing-setup-notification.service.js resolves ENTITY owners and is the
// wrong source for all of them.
const SUPER_ADMIN_SQL = `
  SELECT id, email, full_name
  FROM users
  WHERE is_super_admin = true
    AND is_active = true
    AND email IS NOT NULL
    AND email <> ''
  ORDER BY id`;

// Centralized policy. Intentionally a flat literal, not a framework: adding
// a P1 event later means adding one row here plus one call site, and never
// touching this file's logic.
//
// deliveryMode is 'immediate' for every event in this slice. The field
// exists so a future digest/batched mode has an obvious home; there is no
// batching implementation and 'immediate' is the only value handled.
const EVENT_POLICY = {
  // A — job-runner.js, after job_runs.status='failed' is written.
  job_run_failed: {
    enabled: true, severity: 'critical', deliveryMode: 'immediate',
    recipientRole: 'SUPER_ADMIN', template: 'admin-job-failed',
  },
  // B — operational-alerting.job.js. Covers both scopes (the Render Cron
  // heartbeat itself, and a single job stale past 2x its interval); the
  // template branches on data.scope.
  scheduler_stale: {
    enabled: true, severity: 'critical', deliveryMode: 'immediate',
    recipientRole: 'SUPER_ADMIN', template: 'admin-scheduler-stale',
  },
  // C — payment.handler.js::holdForVerification.
  gate_v1_mismatch: {
    enabled: true, severity: 'critical', deliveryMode: 'immediate',
    recipientRole: 'SUPER_ADMIN', template: 'admin-operational-finding',
  },
  // D — stale-pending-donations.job.js.
  pending_donation_missing_low_profile_id: {
    enabled: true, severity: 'warning', deliveryMode: 'immediate',
    recipientRole: 'SUPER_ADMIN', template: 'admin-operational-finding',
  },
  // E — webhook-recovery.job.js, only on the two give-up outcomes.
  webhook_recovery_unresolved: {
    enabled: true, severity: 'warning', deliveryMode: 'immediate',
    recipientRole: 'SUPER_ADMIN', template: 'admin-webhook-unresolved',
  },
  // F — stuck-recurring-signups.job.js.
  stuck_recurring_signup: {
    enabled: true, severity: 'critical', deliveryMode: 'immediate',
    recipientRole: 'SUPER_ADMIN', template: 'admin-operational-finding',
  },
  // G — master-recurring.handler.js, off the new finding it now records.
  recurring_unexplained_inactive: {
    enabled: true, severity: 'warning', deliveryMode: 'immediate',
    recipientRole: 'SUPER_ADMIN', template: 'admin-operational-finding',
  },
  // H — platform.service.js::hardDeleteEntity, after COMMIT. severity is
  // 'administrative', not 'critical' (2026-10-08): by the time this fires the
  // deletion already completed, deliberately and with authorization — it is
  // a permanent record, not an active incident (see _admin-alert.js's
  // SEVERITY_STYLES.administrative).
  entity_hard_deleted: {
    enabled: true, severity: 'administrative', deliveryMode: 'immediate',
    recipientRole: 'SUPER_ADMIN', template: 'admin-entity-hard-deleted',
  },
};

async function resolveRecipients(recipientRole) {
  if (recipientRole !== 'SUPER_ADMIN') {
    throw new Error(`Unsupported recipientRole: ${recipientRole}`);
  }
  const { rows } = await db.query(SUPER_ADMIN_SQL);
  return rows;
}

// Returns a result object, never throws. Statuses:
//   'dispatched' | 'unknown_event' | 'disabled_by_policy' |
//   'missing_incident_key' | 'no_recipient' | 'error'
async function dispatchAdminNotification(eventType, payload = {}) {
  const policy = EVENT_POLICY[eventType];
  if (!policy) {
    console.error(`[AdminNotification] unknown event type: ${eventType}`);
    return { status: 'unknown_event', eventType };
  }
  if (!policy.enabled) return { status: 'disabled_by_policy', eventType };

  const { incidentKey, data = {} } = payload;
  if (!incidentKey) {
    // Refused rather than sent unkeyed: an unkeyed operational alert is
    // exactly the "one email per job re-run" failure mode this slice exists
    // to prevent.
    console.error(`[AdminNotification] ${eventType}: refusing to send without an incidentKey`);
    return { status: 'missing_incident_key', eventType };
  }

  const recipients = await resolveRecipients(policy.recipientRole);
  if (recipients.length === 0) {
    console.error(`[AdminNotification] ${eventType}: no active ${policy.recipientRole} recipient found`);
    return { status: 'no_recipient', eventType };
  }

  const results = [];
  for (const recipient of recipients) {
    // Awaited exports.send, not the fire-and-forget queue: this whole
    // function already runs off the caller's critical path (see
    // queueAdminNotification), and knowing the per-recipient outcome is what
    // makes the tests and the previews meaningful. emailService.send()
    // swallows provider errors into email_logs itself.
    const result = await emailService.send({
      template: policy.template,
      to: recipient.email,
      data: { ...data, eventType, severity: data.severity || policy.severity },
      userId: recipient.id,
      // Per-recipient suffix: several Super Admins each get their own email
      // for the same incident, and each is independently deduped.
      idempotencyKey: `${incidentKey}:${recipient.id}`,
      // entityId/campaignId/donationId are deliberately NOT set on the
      // email_logs row for admin alerts. Two reasons: (1) hardDeleteEntity
      // has already deleted the entity by the time event H is sent, so the
      // FK would reject the row outright; (2) hardDeleteEntity also deletes
      // email_logs by entity_id, and an operational record of a deletion
      // must not be deleted by the very thing it records. The ids live in
      // `payload.data` and in the rendered body instead.
    });
    results.push({ userId: recipient.id, to: recipient.email, ...result });
  }

  return {
    status: 'dispatched',
    eventType,
    template: policy.template,
    severity: policy.severity,
    recipients: recipients.length,
    results,
  };
}

// THE call site contract for every job/handler: synchronous, returns
// nothing, cannot throw, cannot delay the caller. Mirrors
// emailService.queue's setImmediate pattern so the business write that
// triggered it is never waiting on recipient lookup or a provider.
exports.queueAdminNotification = (eventType, payload) => {
  setImmediate(() => {
    dispatchAdminNotification(eventType, payload).catch((err) => {
      console.error(`[AdminNotification] ${eventType} dispatch crashed:`, err.message);
    });
  });
};

// Awaited variant for tests, scripts and the preview generator — same code
// path, resolved outcome instead of fire-and-forget.
exports.sendAdminNotification = (eventType, payload) =>
  dispatchAdminNotification(eventType, payload).catch((err) => {
    console.error(`[AdminNotification] ${eventType} dispatch crashed:`, err.message);
    return { status: 'error', eventType, error: err.message };
  });

exports.EVENT_POLICY = EVENT_POLICY;
exports.resolveSuperAdminRecipients = () => resolveRecipients('SUPER_ADMIN');
