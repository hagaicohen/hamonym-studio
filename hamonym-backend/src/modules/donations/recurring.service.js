const db = require('../../db/db');
const recurringClient = require('../payment/cardcom/recurring.client');

// dd/MM/yyyy — the format RecurringPayment.aspx expects for date fields,
// confirmed empirically. Different from every other Cardcom surface touched
// so far (REST v11 returns ISO-like, GetRecurringPaymentHistory wants
// DDMMYYYY with no separators) — see the "Date handling" caution in
// docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §4. Do not reuse this for
// any other Cardcom endpoint without checking its own format first.
function formatDateSlashed(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

// The donor already paid the first cycle via the LowProfile itself
// (verified: that charge is not counted in Cardcom's own
// NumOfPaymentsAlreadyCharged) — so the recurring schedule starts one
// interval from now, not immediately.
function nextMonthDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

// Called from donations.service.js::createDonation, before the LowProfile is
// built, when the donor chose a recurring donation. Creates the
// Hamonym-internal signup record in 'pending_payment' — Cardcom knows
// nothing about it yet. Returns its id so the donation row can link to it
// immediately (see docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §2 — the
// donation is linked from creation, not via a separate boolean flag).
exports.createSignup = async ({ entityId, campaignId, donorName, donorEmail, donorPhone, amount, timeIntervalId = 1 }) => {
  const res = await db.query(
    `INSERT INTO recurring_instructions (entity_id, campaign_id, donor_name, donor_email, donor_phone, amount, time_interval_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_payment')
     RETURNING id`,
    [entityId, campaignId, donorName || null, donorEmail || null, donorPhone || null, amount, timeIntervalId]
  );
  return res.rows[0].id;
};

// Called from payment.handler.js after the first LowProfile payment is
// confirmed paid. Idempotent — a re-delivered webhook that calls this again
// finds cardcom_recurring_id already set and no-ops, so it never creates a
// duplicate Master. Never throws — a Cardcom failure here must not affect a
// donation that already succeeded; the failure is recorded on the
// recurring_instructions row for later recovery instead (see the
// pending_creation → creation_failed split in migration 044).
exports.completeSignup = async (donationId) => {
  const donationRes = await db.query(
    `SELECT d.recurring_instruction_id, d.low_profile_id, d.donor_name,
            ri.status, ri.cardcom_recurring_id, ri.amount, ri.time_interval_id
     FROM donations d
     LEFT JOIN recurring_instructions ri ON ri.id = d.recurring_instruction_id
     WHERE d.id = $1`,
    [donationId]
  );

  const row = donationRes.rows[0];
  if (!row || !row.recurring_instruction_id) return; // ordinary one-time donation

  if (row.cardcom_recurring_id) return; // already completed — idempotency guard

  const instructionId = row.recurring_instruction_id;
  await db.query(`UPDATE recurring_instructions SET status='pending_creation', updated_at=NOW() WHERE id=$1`, [instructionId]);

  try {
    const credentials = await require('./donations.service').resolveCardcomCredentials(donationId);
    const nextDateToBill = formatDateSlashed(nextMonthDate());

    const result = await recurringClient.createRecurring({
      terminalNumber: credentials.terminalNumber,
      userName: credentials.apiName,
      apiPassword: credentials.apiPassword,
      chargeInTerminal: credentials.terminalNumber, // same terminal as LowProfile — verified to work, not required to differ
      lowProfileDealGuid: row.low_profile_id,
      donorName: row.donor_name,
      amount: row.amount,
      invoiceDescription: 'תרומה חודשית',
      internalDescription: `Hamonym recurring — ${instructionId}`,
      nextDateToBill,
      totalNumOfBills: 99999, // ongoing until cancelled — product decision, not a Cardcom convention we found documented as a magic sentinel
      timeIntervalId: row.time_interval_id,
      returnValue: instructionId,
    });

    if (result.ResponseCode === '0') {
      await db.query(
        `UPDATE recurring_instructions
         SET status='active', cardcom_account_id=$1, cardcom_recurring_id=$2, next_date_to_bill=$3, updated_at=NOW()
         WHERE id=$4`,
        [result.AccountId, result['Recurring0.RecurringId'], nextMonthDate(), instructionId]
      );
    } else {
      await db.query(
        `UPDATE recurring_instructions SET status='creation_failed', failure_reason=$1, updated_at=NOW() WHERE id=$2`,
        [result.Description || `ResponseCode ${result.ResponseCode}`, instructionId]
      );
    }
  } catch (err) {
    await db.query(
      `UPDATE recurring_instructions SET status='creation_failed', failure_reason=$1, updated_at=NOW() WHERE id=$2`,
      [err.message, instructionId]
    );
  }
};
