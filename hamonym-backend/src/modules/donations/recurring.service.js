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

// Extracts a calendar day-of-month from a pg-sourced DATE value.
//
// ⚠️ Corrected 2026-08-16 (Personal Area date-bug investigation) — this
// function's own previous version did the opposite of what's correct, and
// the comment above it was wrong. PostgreSQL DATE is a calendar date, not
// an instant — it has no timezone. `pg`'s parser (postgres-date) reflects
// that deliberately: a DATE column comes back as a JS Date built at LOCAL
// midnight for that calendar day ("Force YYYY-MM-DD dates to be parsed as
// local time" — postgres-date's own source), not UTC midnight. Converting
// through `.toISOString()` (always UTC) before reading the day therefore
// shifts the result backward by one on any server whose local TZ is ahead
// of UTC (Israel, confirmed empirically) — that was this function's actual
// bug, silently affecting pauseRecurring/resumeRecurring's anchor-day
// backfill. Reading the day via LOCAL getters (`.getDate()`) is what
// correctly recovers the calendar date pg encoded — never round-trip a
// DATE value through UTC to extract a calendar field from it.
function dayOfMonthFromDate(value) {
  return new Date(value).getDate();
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
// finds either cardcom_recurring_id already set (normal path) or status
// already 'completed' (the N=1 short-circuit below, which never gets a
// cardcom_recurring_id at all) and no-ops either way, so it never creates a
// duplicate Master. Never throws — a Cardcom failure here must not affect a
// donation that already succeeded; the failure is recorded on the
// recurring_instructions row for later recovery instead (see the
// pending_creation → creation_failed split in migration 044).
exports.completeSignup = async (donationId) => {
  const donationRes = await db.query(
    `SELECT d.recurring_instruction_id, d.low_profile_id, d.donor_name,
            ri.status, ri.cardcom_recurring_id, ri.amount, ri.time_interval_id,
            c.recurring_billing_mode, c.recurring_installments_count
     FROM donations d
     LEFT JOIN recurring_instructions ri ON ri.id = d.recurring_instruction_id
     LEFT JOIN campaigns c ON c.id = ri.campaign_id
     WHERE d.id = $1`,
    [donationId]
  );

  const row = donationRes.rows[0];
  if (!row || !row.recurring_instruction_id) return; // ordinary one-time donation

  if (row.cardcom_recurring_id || row.status === 'completed') return; // idempotency guard — covers both the normal path and the N=1 short-circuit below

  const instructionId = row.recurring_instruction_id;

  // Snapshot the campaign's billing plan at signup time — independent of
  // any later change to the campaign's own settings, same principle as
  // billing_anchor_day (Phase 5). null = until cancelled (existing
  // behavior, and also what a still-'pending_creation' idempotent retry
  // would recompute identically). A number = total payments promised,
  // including the LowProfile one already charged. See
  // docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §9.3.
  const totalInstallments = row.recurring_billing_mode === 'fixed_installments'
    ? row.recurring_installments_count
    : null;

  // N=1: the single promised payment already happened via the LowProfile
  // itself — Verified (2026-08-14): Cardcom never counts that charge
  // against TotalNumOfBills, so a Recurring order here would be created
  // only to sit there and never bill. Skip Create entirely.
  if (totalInstallments === 1) {
    await db.query(
      `UPDATE recurring_instructions SET status='completed', total_installments=$1, updated_at=NOW() WHERE id=$2`,
      [totalInstallments, instructionId]
    );
    return;
  }

  await db.query(
    `UPDATE recurring_instructions SET status='pending_creation', total_installments=$1, updated_at=NOW() WHERE id=$2`,
    [totalInstallments, instructionId]
  );

  try {
    const credentials = await require('./donations.service').resolveCardcomCredentials(donationId);
    const nextDateToBill = formatDateSlashed(nextMonthDate());
    // Verified end-to-end (2026-08-14, RecurringId=44215): the LowProfile's
    // own charge isn't counted against TotalNumOfBills, so N total
    // payments including it means N-1 further Cardcom-managed cycles.
    const totalNumOfBills = totalInstallments == null ? 99999 : totalInstallments - 1;

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
      totalNumOfBills,
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
  // ⚠️ Gap closed 2026-08-16 (same review as resumeRecurring's fix below) —
  // only 'active' should be pausable. Without this, pausing a 'cancelled'
  // or 'completed' instruction would silently overwrite that status with
  // 'paused', destroying the distinction between "donor cancelled" /
  // "plan finished on schedule" and "temporarily paused".
  if (instruction.status !== 'active') {
    throw new Error(`Cannot pause a recurring instruction with status '${instruction.status}'`);
  }

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
  // ⚠️ Gap closed 2026-08-16 (Personal Area action-endpoint review, before
  // any route called this) — 'active'/'cancelled' were the only statuses
  // checked, so 'completed' (Phase 7 — TotalNumOfBills exhausted) and every
  // other non-paused status (inactive/creation_failed/pending_*) fell
  // through and would have gone ahead and called Cardcom. Only a genuinely
  // 'paused' instruction should ever be resumable.
  if (instruction.status !== 'paused') {
    throw new Error(`Cannot resume a recurring instruction with status '${instruction.status}'`);
  }

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
  // ⚠️ Gap closed 2026-08-16 (same review as pauseRecurring/resumeRecurring's
  // fixes above) — active and paused are both legitimate states to cancel
  // from (cancelling a currently-paused gift is a normal donor action).
  // Everything else (completed/inactive/creation_failed/pending_*) has
  // nothing meaningful to cancel and must not be overwritten to 'cancelled'.
  if (!['active', 'paused'].includes(instruction.status)) {
    throw new Error(`Cannot cancel a recurring instruction with status '${instruction.status}'`);
  }

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

/* ─────────────────────────────────────────
   DONOR-FACING (Personal Area) — read-only
   recurring_instructions has no donor_user_id column (only donor_name/
   donor_email/donor_phone, snapshotted at signup) — every donor-facing
   query here goes through donations.donor_user_id instead, the same
   column getMyDonations already trusts. Deliberately not by donor_email:
   that snapshot can go stale if the account's email ever changes, donor_user_id
   can't.
───────────────────────────────────────── */

// ⚠️ Found empirically (2026-08-16, browser verification) — `pg`'s DATE
// parser (postgres-date) deliberately builds `next_date_to_bill` as a JS
// Date at LOCAL midnight, not UTC midnight ("Force YYYY-MM-DD dates to be
// parsed as local time" — postgres-date/index.js). On a server whose local
// TZ is ahead of UTC (Israel, UTC+2/+3 — confirmed here), naively sending
// that Date through res.json() (which serializes via toISOString(), always
// UTC) shifts the calendar day back by one — donors would be shown the
// wrong billing date. Extracting via LOCAL getters (not toISOString/UTC
// getters) recovers the date pg actually encoded, regardless of server TZ.
// Same principle as dayOfMonthFromDate above (fixed the same day, same
// root cause) — kept as a separate function because this one returns a
// full YYYY-MM-DD string, not just a day number.
function toDateOnlyIsoString(value) {
  if (!value) return null;
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Hard ownership gate — every donor-facing action/read on a specific
// instruction (this file's history query, and Pause/Resume/Cancel once
// they get routes) must call this first. Without it, a logged-in donor
// could act on any recurring_instructions.id they happen to guess/enumerate,
// since pauseRecurring/resumeRecurring/cancelRecurring themselves take no
// donor context at all — that check has never existed anywhere until now
// because nothing HTTP-reachable called them before.
exports.verifyOwnership = async (instructionId, userId) => {
  const res = await db.query(
    `SELECT 1 FROM donations
     WHERE recurring_instruction_id = $1 AND donor_user_id = $2
     LIMIT 1`,
    [instructionId, userId]
  );
  return res.rows.length > 0;
};

// One row per recurring instruction this donor has ever paid into (found
// via the same donations.donor_user_id join as getMyDonations — a donor
// only ever "has" an instruction because at least one donation under it is
// theirs). paidCount is X in "X מתוך N" — counted from OUR OWN paid
// donations, deliberately not Cardcom's NumOfPaymentsAlreadyCharged (that
// excludes the first LowProfile charge; total_installments does not — see
// completeSignup's N-1 comment). resumePreviewNextDateToBill is computed
// with the exact same nextOccurrenceOfAnchorDay used by resumeRecurring
// itself — one implementation, so the date a paused donor previews here is
// guaranteed to match what an actual Resume would set.
exports.getMyRecurringInstructions = async (userId) => {
  const res = await db.query(
    `SELECT ri.id, ri.status, ri.amount, ri.next_date_to_bill, ri.total_installments,
            ri.billing_anchor_day, ri.cancelled_at, ri.created_at,
            c.title AS campaign_title, c.slug AS campaign_slug, c.cover_image_url,
            e.display_name AS entity_name, e.logo_url AS entity_logo,
            (SELECT COUNT(*)::int FROM donations dd
              WHERE dd.recurring_instruction_id = ri.id AND dd.status = 'paid') AS paid_count
     FROM recurring_instructions ri
     JOIN campaigns c ON c.id = ri.campaign_id
     JOIN entities  e ON e.id = ri.entity_id
     WHERE ri.id IN (
       SELECT DISTINCT recurring_instruction_id FROM donations
       WHERE donor_user_id = $1 AND recurring_instruction_id IS NOT NULL
     )
     ORDER BY ri.created_at DESC`,
    [userId]
  );

  return res.rows.map((row) => ({
    ...row,
    next_date_to_bill: toDateOnlyIsoString(row.next_date_to_bill),
    resume_preview_next_date_to_bill:
      row.status === 'paused' && row.billing_anchor_day
        ? formatDateSlashed(nextOccurrenceOfAnchorDay(row.billing_anchor_day))
        : null,
  }));
};

// Charges under one instruction — ownership already verified by the caller
// (controller calls verifyOwnership first; this function trusts it, same
// pattern as every other *ById internal function in this codebase). Only
// 'paid' rows, matching getMyDonations' own filter — a failed billing
// attempt has no receipt and isn't part of what a donor reviews here.
exports.getRecurringDonationHistory = async (instructionId) => {
  const res = await db.query(
    `SELECT d.id, d.amount, d.completed_at, r.id AS receipt_id
     FROM donations d
     LEFT JOIN receipts r ON r.donation_id = d.id
     WHERE d.recurring_instruction_id = $1 AND d.status = 'paid'
     ORDER BY d.completed_at DESC`,
    [instructionId]
  );
  return res.rows;
};
