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
function parseSlashedDate(str) {
  if (!str) return null;
  const [dd, mm, yyyy] = str.split('/');
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

exports.handle = async (payload) => {
  const recurringId = payload.RecurringId;
  if (!recurringId) return;

  // Reuses the existing 'active'/'creation_failed'/etc string column (no
  // CHECK constraint — see migration 044) rather than adding a dedicated
  // column for Cardcom's own IsActive, since Phase 2 must not require a new
  // migration. Only ever reached for a row that's already 'active' (a
  // Master webhook can't exist before our own Create succeeded), so this
  // can't clobber the pending_payment/pending_creation/creation_failed
  // signup states.
  const isActive = String(payload.IsActive).toLowerCase() === 'true';
  const nextDateToBill = parseSlashedDate(payload.NextDateToBill);

  await db.query(
    `UPDATE recurring_instructions
     SET status = $1,
         next_date_to_bill = COALESCE($2, next_date_to_bill),
         updated_at = NOW()
     WHERE cardcom_recurring_id = $3`,
    [isActive ? 'active' : 'inactive', nextDateToBill, recurringId]
  );
};
