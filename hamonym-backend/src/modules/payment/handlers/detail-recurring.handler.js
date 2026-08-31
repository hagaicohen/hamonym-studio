const db = require('../../../db/db');

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
  await db.query(
    `INSERT INTO donations (
       campaign_id, entity_id, amount, donor_name, donor_email, donor_phone,
       rewards, status, is_mock, recurring_instruction_id, provider_reference,
       provider_row_id, provider_status_code, failure_reason, completed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,'[]','failed',false,$7,$8,$9,$10,$11,NOW())`,
    [
      instruction.campaign_id, instruction.entity_id, amount,
      instruction.donor_name, instruction.donor_email, instruction.donor_phone,
      instruction.id, String(internalDealNumber), rowId, statusCode,
      `cardcom_recurring_${rawStatus}`,
    ]
  );

  if (instruction.entity_id) require('../../dashboard/dashboard.service').invalidateDashboard(instruction.entity_id);
};
