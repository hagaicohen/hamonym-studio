// Billing Setup Notification (2026-09-02, simplified 2026-09-10) — the
// entity-admin-facing half of the Billing readiness correction: when
// Production Calculation finds real, eligible donation activity for an
// entity whose billing_account is missing or not active, the entity
// administrator must be told — once per (entity, billing period, blocking
// reason). See migration 062.
//
// Deliberately NOT retried. A same-day attempt at automatic retry-until-
// delivered (row locking, a reuse branch, a `delivered` gate) was built,
// tested, and then rolled back before ever being committed -- Billing v1's
// stated priority is simplicity/understandability over automation, and the
// channel that retry would have been retrying has never once delivered in
// production (EMAIL_ENABLED has never been true here). Automatic retry of
// a channel that doesn't exist yet is pure complexity with no payoff. If
// this needs revisiting, do it as a manual "שלח שוב" operator action once
// Billing Ops actually surfaces blocked statements -- not as background
// automation.
//
// What's kept from that attempt: `delivered` (migration 065, additive,
// already applied) now honestly records whether THIS ONE attempt actually
// went out, instead of the original version's `notified_admin_count`
// always claiming success regardless of outcome. And email.service.js's
// dispatch() now returns {status}, so this caller can know the real result
// -- awaited via exports.send, not the fire-and-forget exports.queue used
// elsewhere (entities.service.js / platform.service.js), because this is
// the one call site that actually needs to know.
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
//
// Returns:
//   { sent: true, adminCount }                        — attempted this run, at least one admin actually delivered
//   { sent: false, reason: 'already_notified' }        — same (entity, period, reason) already attempted before (regardless of outcome — no retry)
//   { sent: false, reason: 'no_admin_found' }           — nobody to notify (still recorded, won't retry)
//   { sent: false, reason: 'attempted_not_delivered' }  — attempted this run, every admin's send failed/was disabled (still recorded, won't retry)
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
  let deliveredCount = 0;
  for (const admin of admins) {
    // Awaited (exports.send), not queue()'d -- this caller records the
    // real outcome in `delivered` rather than assuming success.
    const result = await emailService.send({
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
    if (result.status === 'sent' || result.status === 'stub') deliveredCount++;
  }

  const delivered = deliveredCount > 0;
  await pool.query(
    `UPDATE billing_setup_notifications SET notified_admin_count = $2, delivered = $3 WHERE id = $1`,
    [insertRes.rows[0].id, deliveredCount, delivered]
  );

  return delivered
    ? { sent: true, adminCount: deliveredCount }
    : { sent: false, reason: 'attempted_not_delivered' };
}

module.exports = { resolveEntityAdmins, notifyBillingSetupRequired };
