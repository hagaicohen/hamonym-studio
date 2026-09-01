// Billing Setup Notification (2026-09-02) — the entity-admin-facing half of
// the Billing readiness correction: when Production Calculation finds real,
// eligible donation activity for an entity whose billing_account is missing
// or not active, the entity administrator must be told — exactly once per
// (entity, billing period, blocking reason). See migration 062.
//
// Reuses the existing email module (src/modules/email/email.service.js) —
// same template-driven, EMAIL_ENABLED-gated, email_logs-recorded,
// fire-and-forget .queue() pattern already used for
// entity-flagged-for-review / invite-admin / invite-partner-editor
// (entities.service.js / platform.service.js). No new provider, no parallel
// notification system — see the E2E audit this task was scoped against:
// dashboard.service.js's "alerts" are a purely computed, on-request SQL
// view with no backing table and no email hook, so there was nothing there
// to reuse.
//
// Entity admin resolution: user_entities.role = 'owner' is the only role
// value that exists in production data today (manager/finance_manager/
// campaign_manager are schema-allowed by user_entities_role_check but
// unused) — 'owner' is therefore the correct "entity administrator" target
// until a finer-grained role is actually assigned to anyone.
const pool = require('../../db/db');
const emailService = require('../email/email.service');

async function resolveEntityAdmins(entityId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.full_name
     FROM user_entities ue
     JOIN users u ON u.id = ue.user_id
     WHERE ue.entity_id = $1 AND ue.role = 'owner' AND u.is_active = true`,
    [entityId]
  );
  return rows;
}

// Never invents a fee/VAT/total_due — only known facts (donation count,
// gross paid amount) are ever passed to the template. The dedup
// INSERT ... ON CONFLICT DO NOTHING is the actual guarantee (atomic even
// under two calculation runs racing each other) — not a prior SELECT.
// Returns:
//   { sent: true, adminCount }                          — new notification, queued
//   { sent: false, reason: 'already_notified' }          — same (entity, period, reason) seen before
//   { sent: false, reason: 'no_admin_found' }             — nobody to notify (still recorded, won't retry)
async function notifyBillingSetupRequired({
  entityId, entityName, billingPeriodId, blockingReason, donationCount, grossAmount,
}) {
  const insertRes = await pool.query(
    `INSERT INTO billing_setup_notifications (
       entity_id, billing_period_id, blocking_reason, donation_count, gross_amount
     ) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (entity_id, billing_period_id, blocking_reason) DO NOTHING
     RETURNING id`,
    [entityId, billingPeriodId, blockingReason, donationCount, grossAmount]
  );
  if (insertRes.rows.length === 0) {
    return { sent: false, reason: 'already_notified' };
  }

  const admins = await resolveEntityAdmins(entityId);
  if (admins.length === 0) {
    return { sent: false, reason: 'no_admin_found' };
  }

  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
  for (const admin of admins) {
    emailService.queue({
      template: 'billing-setup-required',
      to: admin.email,
      data: {
        entityName,
        donationCount,
        grossAmount,
        settingsUrl: `${frontBase}/settings/entities/${entityId}`,
      },
      entityId,
      userId: admin.id,
    });
  }

  await pool.query(
    `UPDATE billing_setup_notifications SET notified_admin_count = $2 WHERE id = $1`,
    [insertRes.rows[0].id, admins.length]
  );

  return { sent: true, adminCount: admins.length };
}

module.exports = { resolveEntityAdmins, notifyBillingSetupRequired };
