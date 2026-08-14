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

// Extracts a calendar day-of-month from a value that may be a JS Date
// (as pg returns DATE columns, at UTC midnight) or an ISO string — always
// via the UTC/ISO representation, never .getDate() on a DB-sourced value,
// to avoid a local-timezone off-by-one on the day. Same caution as
// CLAUDE.md's date-handling convention, applied to a single day-of-month
// instead of a full DD/MM/YYYY string.
function dayOfMonthFromDate(value) {
  return Number(new Date(value).toISOString().slice(0, 10).split('-')[2]);
}

// Resume's product rule (locked 2026-08-14): keep the donor's original
// monthly billing day, pick its next occurrence that is strictly in the
// future. No catch-up for skipped months, no immediate/same-day charge, no
// permanent shift of the billing day. Clamps to the last real day of a
// shorter month (e.g. anchor=31 in February) rather than rolling into the
// next month entirely.
function clampedMonthDate(year, month, day) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, daysInMonth));
}

function nextOccurrenceOfAnchorDay(anchorDay) {
  const now = new Date();
  const candidate = clampedMonthDate(now.getFullYear(), now.getMonth(), anchorDay);
  if (candidate <= now) {
    return clampedMonthDate(now.getFullYear(), now.getMonth() + 1, anchorDay);
  }
  return candidate;
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
      const scheduledDate = nextMonthDate();
      await db.query(
        `UPDATE recurring_instructions
         SET status='active', cardcom_account_id=$1, cardcom_recurring_id=$2, next_date_to_bill=$3,
             billing_anchor_day=$4, updated_at=NOW()
         WHERE id=$5`,
        [result.AccountId, result['Recurring0.RecurringId'], scheduledDate, scheduledDate.getDate(), instructionId]
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

// Phase 5 (docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §9.1). Both Pause
// and Resume are Hamonym-initiated, synchronous calls — not webhook-driven
// — so a Cardcom failure is surfaced to the caller immediately (thrown),
// never written to local state as if it succeeded. The later
// MasterRecurring webhook (verified to fire on an IsActive change) confirms/
// re-syncs afterwards, same trust pattern as Create in Phase 1 — it is not
// a gate before updating locally from the synchronous ResponseCode=0.
exports.pauseRecurring = async (instructionId) => {
  const instrRes = await db.query(
    `SELECT id, entity_id, cardcom_recurring_id, status, next_date_to_bill, billing_anchor_day
     FROM recurring_instructions WHERE id = $1`,
    [instructionId]
  );
  const instruction = instrRes.rows[0];
  if (!instruction) throw new Error('Recurring instruction not found');
  if (!instruction.cardcom_recurring_id) throw new Error('Recurring instruction has no Cardcom recurring id yet');
  if (instruction.status === 'paused') return { alreadyPaused: true };

  const credentials = await require('./donations.service').resolveCardcomCredentialsForEntity(instruction.entity_id);
  const result = await recurringClient.updateRecurring({
    terminalNumber: credentials.terminalNumber,
    userName: credentials.apiName,
    apiPassword: credentials.apiPassword,
    recurringId: instruction.cardcom_recurring_id,
    isActive: false,
  });

  if (result.ResponseCode !== '0') {
    throw new Error(result.Description || `Cardcom update failed (ResponseCode ${result.ResponseCode})`);
  }

  // Lazy backfill: existing rows created before this column existed get
  // billing_anchor_day set here, from whatever next_date_to_bill they
  // currently hold — not a bulk migration backfill, by design (see §9.1).
  const anchorDay = instruction.billing_anchor_day
    || (instruction.next_date_to_bill ? dayOfMonthFromDate(instruction.next_date_to_bill) : null);

  await db.query(
    `UPDATE recurring_instructions
     SET status='paused', billing_anchor_day=COALESCE(billing_anchor_day, $1), updated_at=NOW()
     WHERE id=$2`,
    [anchorDay, instructionId]
  );

  return { paused: true };
};

exports.resumeRecurring = async (instructionId) => {
  const instrRes = await db.query(
    `SELECT id, entity_id, cardcom_recurring_id, status, next_date_to_bill, billing_anchor_day
     FROM recurring_instructions WHERE id = $1`,
    [instructionId]
  );
  const instruction = instrRes.rows[0];
  if (!instruction) throw new Error('Recurring instruction not found');
  if (!instruction.cardcom_recurring_id) throw new Error('Recurring instruction has no Cardcom recurring id yet');
  if (instruction.status === 'active') return { alreadyActive: true };
  // Cancelled is a permanent Hamonym decision (Phase 6) — a donor who wants
  // to give again goes through a brand-new signup, not a resurrected
  // instruction. Cardcom itself would technically allow IsActive=true again
  // (same mechanism as Resume), so this guard is a Hamonym-side rule, not a
  // Cardcom limitation.
  if (instruction.status === 'cancelled') throw new Error('Cannot resume a cancelled recurring instruction — start a new signup instead');

  // Same lazy-backfill fallback as pauseRecurring, for a row that somehow
  // reached Resume without ever going through Pause under this code.
  const anchorDay = instruction.billing_anchor_day
    || (instruction.next_date_to_bill ? dayOfMonthFromDate(instruction.next_date_to_bill) : dayOfMonthFromDate(new Date()));

  const nextDate = nextOccurrenceOfAnchorDay(anchorDay);
  const nextDateToBill = formatDateSlashed(nextDate);

  const credentials = await require('./donations.service').resolveCardcomCredentialsForEntity(instruction.entity_id);
  const result = await recurringClient.updateRecurring({
    terminalNumber: credentials.terminalNumber,
    userName: credentials.apiName,
    apiPassword: credentials.apiPassword,
    recurringId: instruction.cardcom_recurring_id,
    isActive: true,
    nextDateToBill,
  });

  if (result.ResponseCode !== '0') {
    throw new Error(result.Description || `Cardcom update failed (ResponseCode ${result.ResponseCode})`);
  }

  await db.query(
    `UPDATE recurring_instructions
     SET status='active', next_date_to_bill=$1, billing_anchor_day=COALESCE(billing_anchor_day, $2), updated_at=NOW()
     WHERE id=$3`,
    [nextDate, anchorDay, instructionId]
  );

  return { resumed: true, nextDateToBill };
};

// Phase 6. Cancel is a Hamonym product decision, not a distinct Cardcom
// mechanism — no dedicated cancel/delete op was ever found (SOAP WSDL, REST
// v11 swagger, official Name-to-Value PHP samples). It reuses the exact
// same Operation=update+IsActive=false already Verified in Phase 5 (Pause);
// the only new thing is what Hamonym does with 'cancelled' afterwards
// (never resumable — see the guard in resumeRecurring above). Same
// synchronous-response trust pattern as Pause/Resume: local state is never
// written on a Cardcom failure.
exports.cancelRecurring = async (instructionId) => {
  const instrRes = await db.query(
    `SELECT id, entity_id, cardcom_recurring_id, status FROM recurring_instructions WHERE id = $1`,
    [instructionId]
  );
  const instruction = instrRes.rows[0];
  if (!instruction) throw new Error('Recurring instruction not found');
  if (!instruction.cardcom_recurring_id) throw new Error('Recurring instruction has no Cardcom recurring id yet');
  if (instruction.status === 'cancelled') return { alreadyCancelled: true };

  const credentials = await require('./donations.service').resolveCardcomCredentialsForEntity(instruction.entity_id);
  const result = await recurringClient.updateRecurring({
    terminalNumber: credentials.terminalNumber,
    userName: credentials.apiName,
    apiPassword: credentials.apiPassword,
    recurringId: instruction.cardcom_recurring_id,
    isActive: false,
  });

  if (result.ResponseCode !== '0') {
    throw new Error(result.Description || `Cardcom update failed (ResponseCode ${result.ResponseCode})`);
  }

  await db.query(
    `UPDATE recurring_instructions SET status='cancelled', cancelled_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [instructionId]
  );

  return { cancelled: true };
};
