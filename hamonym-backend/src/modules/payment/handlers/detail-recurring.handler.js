const db = require('../../../db/db');

// DetailRecurring — one billing attempt for an existing Recurring
// Instruction. Phase 3 scope: SUCCESSFUL only — see
// docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §8. Every other status
// (PENDINGFORPROCESSING/DEBTAUTOBILLING/LOSTDEBT/PAYBYOTHERE/ONHOLD/OTHER)
// is deliberately left unhandled here rather than guessed at — a real
// ONHOLD payload was already captured via GetRecurringPaymentHistory
// (2026-08-14), but never through this webhook itself, so its exact
// DetailRecurring shape is still unverified. Building failure semantics on
// an unverified shape is exactly the mistake the LowProfile Redirect bug
// (docs/CARDCOM_INTEGRATION.md's P1) already taught this project not to make.
exports.handle = async (payload) => {
  if (payload.Status !== 'SUCCESSFUL') {
    console.log(`[detail-recurring.handler] Status=${payload.Status} not handled yet (Phase 4) — RecurringId=${payload.RecurringId}`);
    return;
  }

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
  // new one.
  const existing = await db.query(
    `SELECT id FROM donations WHERE recurring_instruction_id = $1 AND provider_reference = $2`,
    [instruction.id, String(internalDealNumber)]
  );
  if (existing.rows[0]) return;

  const amount = payload.Sum || instruction.amount;

  const donationRes = await db.query(
    `INSERT INTO donations (
       campaign_id, entity_id, amount, donor_name, donor_email, donor_phone,
       rewards, status, is_mock, recurring_instruction_id, provider_reference, completed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,'[]','paid',false,$7,$8,NOW())
     RETURNING id`,
    [
      instruction.campaign_id, instruction.entity_id, amount,
      instruction.donor_name, instruction.donor_email, instruction.donor_phone,
      instruction.id, String(internalDealNumber),
    ]
  );
  const donationId = donationRes.rows[0].id;

  await db.query(
    `UPDATE campaigns
     SET current_amount = current_amount + $1, supporters_count = supporters_count + 1, updated_at = NOW()
     WHERE id = $2`,
    [amount, instruction.campaign_id]
  );

  if (instruction.entity_id) require('../../dashboard/dashboard.service').invalidateDashboard(instruction.entity_id);
  await require('../../donations/donations.service').finalizePaidDonation(donationId);
};
