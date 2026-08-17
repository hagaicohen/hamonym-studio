const db = require('../../../db/db');

// MasterRecurring — a change notification for the recurring instruction
// itself (created / IsActive flip / any field edit), not a charge. Fires on
// every field change, not just Active/Inactive transitions — confirmed
// empirically (2026-08-14) by an Update call that only touched
// NextDateToBill still producing a Master webhook. See
// docs/CARDCOM_RECURRING_ARCHITECTURE.md's Lifecycle section — the
// CardCom-side reason for an Inactive transition stays deliberately
// unmodeled (Provisional), we only mirror what's reported.
//
// NextDateToBill arrives dd/MM/yyyy — verified against a real captured
// payload, same format Update sends, different from every other Cardcom
// date surface touched so far (see recurring.service.js's own caution).
// The at-creation Master webhook (never captured before 2026-08-17, since
// every earlier capture came from a manual Update call in Test) appends a
// time-of-day using '/' as its separator too, e.g. "17/09/2026 00/00" —
// takes the date portion up to the first space and ignores the rest, since
// the destination column is a plain DATE, not a timestamp.
function parseSlashedDate(str) {
  if (!str) return null;
  const [dd, mm, yyyy] = str.split(' ')[0].split('/');
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// Cardcom reports exactly one signal for "not active" — IsActive=false —
// whether the reason is Hamonym pausing it, Hamonym cancelling it, or
// Cardcom itself exhausting TotalNumOfBills (Verified end-to-end,
// 2026-08-14 — see docs/CARDCOM_RECURRING_ARCHITECTURE.md's Lifecycle
// section). Hamonym still needs to tell these apart: paused/cancelled were
// already decided locally at the moment Hamonym made the Update call
// (pauseRecurring/cancelRecurring, Phase 5/6) — this webhook is only ever
// a confirmation of something already known, so it must not overwrite
// that decision. A transition Hamonym did NOT already know about is
// either natural completion (deterministic: total_installments is set and
// the count Cardcom reports has reached what Create asked for) or a
// Cardcom-initiated deactivation Hamonym still can't explain (expired
// card, Cardcom policy — see the Architecture doc's still-open
// "CardCom-initiated" case) — falls back to the pre-existing generic
// 'inactive' rather than guessing.
function resolveInactiveStatus(current, payload) {
  if (['paused', 'cancelled', 'completed'].includes(current.status)) return current.status;

  const totalInstallments = current.total_installments;
  const alreadyCharged = payload.NumOfPaymentsAlreadyCharged != null
    ? Number(payload.NumOfPaymentsAlreadyCharged)
    : null;

  // total_installments is N (includes the LowProfile charge); Create sent
  // TotalNumOfBills = N-1, which is what NumOfPaymentsAlreadyCharged counts
  // against — see recurring.service.js::completeSignup.
  if (totalInstallments != null && alreadyCharged != null && alreadyCharged >= totalInstallments - 1) {
    return 'completed';
  }

  return 'inactive';
}

exports.handle = async (payload) => {
  const recurringId = payload.RecurringId;
  if (!recurringId) return;

  const isActive = String(payload.IsActive).toLowerCase() === 'true';
  const nextDateToBill = parseSlashedDate(payload.NextDateToBill);

  const current = await db.query(
    `SELECT status, total_installments FROM recurring_instructions WHERE cardcom_recurring_id = $1`,
    [recurringId]
  );
  const instruction = current.rows[0];
  if (!instruction) return;

  // Reuses the existing 'active'/'creation_failed'/etc string column (no
  // CHECK constraint — see migration 044) rather than adding a dedicated
  // column for Cardcom's own IsActive. Only ever reached for a row that's
  // already past signup (a Master webhook can't exist before our own
  // Create succeeded), so this can't clobber the
  // pending_payment/pending_creation/creation_failed signup states.
  const status = isActive ? 'active' : resolveInactiveStatus(instruction, payload);

  await db.query(
    `UPDATE recurring_instructions
     SET status = $1,
         next_date_to_bill = COALESCE($2, next_date_to_bill),
         updated_at = NOW()
     WHERE cardcom_recurring_id = $3`,
    [status, nextDateToBill, recurringId]
  );
};
