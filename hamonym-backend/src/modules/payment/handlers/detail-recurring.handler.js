const db = require('../../../db/db');
const emailService = require('../../email/email.service');

// Which raw CardCom recurring statuses actually mean "this charge attempt
// did not go through, and the donor can act on it" (2026-10-05, Pilot Email
// P0). Deliberately an ALLOWLIST, not "everything that isn't SUCCESSFUL":
// this handler's non-SUCCESSFUL branch records a `failed` donation row for
// every other raw status too, and several of those do NOT mean the money
// failed —
//   PENDINGFORPROCESSING — still in process, nothing has failed yet
//   PAYBYOTHERE          — settled by other means
//   DEBTAUTOBILLING      — carried as debt, provider will bill again
//   LOSTDEBT / OTHER     — no verified payload shape, meaning unclear
// Telling a donor "your charge failed" on any of those would be telling
// them something Hamonym cannot stand behind. ONHOLD is the one status with
// a verified real webhook payload (see this file's header) AND an
// unambiguous donor-facing meaning, so it is the only one that emails. The
// `failed` donation row is still written for every status exactly as
// before — the row is bookkeeping, the email is a claim.
const DONOR_NOTIFIABLE_FAILURE_STATUSES = new Set(['ONHOLD']);

function formatDateDDMMYYYY(d) {
  const iso = new Date(d).toISOString();
  const [y, m, day] = iso.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

// Never throws. The failed-donation row above has already been committed by
// the time this runs, and payment.controller.js turns any exception out of
// this handler into a 500 + an `error` on cardcom_webhook_events, which
// would make CardCom redeliver a webhook that was in fact processed
// correctly. An email problem must not manufacture a webhook failure.
async function queueRecurringFailureEmail({ instruction, donationId, rawStatus, amount, providerReference }) {
  try {
    if (!DONOR_NOTIFIABLE_FAILURE_STATUSES.has(rawStatus)) return;
    if (!instruction.donor_email) return;

    const detailsRes = await db.query(
      `SELECT c.title AS campaign_title, e.display_name AS entity_name
       FROM campaigns c
       LEFT JOIN entities e ON e.id = c.entity_id
       WHERE c.id = $1`,
      [instruction.campaign_id]
    );
    const details = detailsRes.rows[0] || {};

    emailService.queue({
      template: 'recurring-payment-failed',
      to: instruction.donor_email,
      data: {
        donorName: instruction.donor_name,
        campaignTitle: details.campaign_title || 'הקמפיין',
        entityName: details.entity_name || null,
        amount,
        failedAtDisplay: formatDateDDMMYYYY(Date.now()),
        supportEmail: process.env.EMAIL_REPLY_TO || null,
      },
      entityId: instruction.entity_id,
      campaignId: instruction.campaign_id,
      donationId,
      // Stable across webhook redelivery AND across webhook-recovery.job.js
      // re-running the stored payload: (recurring instruction, CardCom's own
      // InternalDealNumber) is the same business key this handler already
      // dedupes donations on, so the email can never outlive its own
      // guard (migration 070).
      idempotencyKey: `RECURRING_PAYMENT_FAILED:${instruction.id}:${providerReference}`,
    });
  } catch (err) {
    console.error('[detail-recurring] failed to queue donor failure email:', err.message);
  }
}

// DetailRecurring — one billing attempt for an existing Recurring
// Instruction. `SUCCESSFUL` closes it as a real donation (Phase 3).
// Everything else is recorded as a failed billing attempt (Phase 4,
// docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §8.2, Hamonym decision
// 2026-08-14): a real charge attempt happened against a donor's card, so it
// belongs in `donations` for history/support/reconciliation — it just never
// finalizes (no receipt, no campaign aggregate). Only `ONHOLD` has a
// verified real webhook payload so far; every other raw status
// (PENDINGFORPROCESSING/DEBTAUTOBILLING/LOSTDEBT/PAYBYOTHERE/OTHER) goes
// through this same branch rather than inventing per-status handling for
// shapes nobody has seen yet.
exports.handle = async (payload) => {
  const recurringId = payload.RecurringId;
  const internalDealNumber = payload.InternalDealNumber;
  if (!recurringId || !internalDealNumber) return;

  const instructionRes = await db.query(
    `SELECT id, entity_id, campaign_id, donor_name, donor_email, donor_phone, amount
     FROM recurring_instructions WHERE cardcom_recurring_id = $1`,
    [recurringId]
  );
  const instruction = instructionRes.rows[0];
  if (!instruction) return;

  // Business-key idempotency guard (recurring_instruction_id +
  // provider_reference) — this handler is invoked directly by the
  // dispatcher, upstream of the controller's own payload-hash idempotency
  // claim, so this is the layer that actually protects against a
  // non-byte-identical redelivery of the same underlying charge creating a
  // second donation. Reuses `donations.provider_reference`, the same column
  // LowProfile already stores its TranzactionId in — same convention, not a
  // new one. Applies identically to success and failure.
  const existing = await db.query(
    `SELECT id FROM donations WHERE recurring_instruction_id = $1 AND provider_reference = $2`,
    [instruction.id, String(internalDealNumber)]
  );
  if (existing.rows[0]) return;

  const amount = payload.Sum || instruction.amount;
  // Raw provider identifiers, generic columns (not Cardcom-specific naming
  // — see migrations/045_donations_provider_raw_ids.sql). Not part of
  // idempotency, just kept for debugging/reconciliation. Nullable — stored
  // whenever Cardcom sends them, on both success and failure.
  const rowId = payload.RowID != null ? String(payload.RowID) : null;
  const statusCode = payload.ResposeCode != null ? String(payload.ResposeCode) : null;

  if (payload.Status === 'SUCCESSFUL') {
    // 2026-08-31 (Donation Engine closure WP2/WP4): this used to duplicate
    // its own insert/aggregate/receipt transaction here — now shares the
    // exact same primitive the recurring-payment-reconciliation job uses,
    // so a charge discovered via webhook vs. via CardCom's own history API
    // (when a webhook is lost) produce identical resulting state. See
    // donations.service.js#finalizeSuccessfulRecurringCharge.
    const donationsService = require('../../donations/donations.service');
    await donationsService.finalizeSuccessfulRecurringCharge(instruction, {
      amount,
      providerReference: String(internalDealNumber),
      rowId,
      statusCode,
    });
    return;
  }

  // Not SUCCESSFUL — record the attempt, don't finalize it. failure_reason
  // stores CardCom's own raw status (`cardcom_recurring_<status>`), not an
  // invented human description — see the Hamonym decision this implements.
  const rawStatus = payload.Status ? String(payload.Status).toLowerCase() : 'unknown';
  const failedRes = await db.query(
    `INSERT INTO donations (
       campaign_id, entity_id, amount, donor_name, donor_email, donor_phone,
       rewards, status, is_mock, recurring_instruction_id, provider_reference,
       provider_row_id, provider_status_code, failure_reason, completed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,'[]','failed',false,$7,$8,$9,$10,$11,NOW())
     RETURNING id`,
    [
      instruction.campaign_id, instruction.entity_id, amount,
      instruction.donor_name, instruction.donor_email, instruction.donor_phone,
      instruction.id, String(internalDealNumber), rowId, statusCode,
      `cardcom_recurring_${rawStatus}`,
    ]
  );

  if (instruction.entity_id) require('../../dashboard/dashboard.service').invalidateDashboard(instruction.entity_id);

  // Only AFTER the failure is durably persisted — the INSERT above is a
  // plain pool query, so it is already committed by the time this line is
  // reached. The donor is never told a charge failed on the strength of an
  // incoming payload alone: the payload reached this handler only through
  // payment.controller.js's CARDCOM_WEBHOOK_SECRET check (401 otherwise),
  // and only the allowlisted unambiguous statuses actually email.
  await queueRecurringFailureEmail({
    instruction,
    donationId: failedRes.rows[0].id,
    rawStatus: payload.Status ? String(payload.Status).toUpperCase() : 'UNKNOWN',
    amount,
    providerReference: String(internalDealNumber),
  });
};
