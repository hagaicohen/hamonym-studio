const db = require('../../../db/db');
const { recordFinding } = require('../../../jobs/reconciliation-findings');
const adminNotifications = require('../../email/admin-notification.service');

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

// The one piece of NEW persistence this notification slice adds (event G,
// 2026-10-07). resolveInactiveStatus's generic 'inactive' fallback — a
// CardCom-initiated deactivation Hamonym cannot explain — previously left no
// trace at all: no finding, no log, no email, just a status column quietly
// changing. There was therefore nothing durable to notify off.
//
// Fitted into the EXISTING reconciliation_findings mechanism rather than a
// new store: same table, same recordFinding() dedup, same Platform ops
// screen, same resolve-by-operator workflow as every other finding. The only
// new thing is the finding_type string.
//
// Recorded ONLY on the observed transition INTO unexplained-inactive
// (previous status was not already 'inactive'). A MasterRecurring webhook
// fires on every field change, and a redelivered/subsequent webhook for an
// already-inactive instruction is not a new deactivation — recording it
// again would be able to reopen a finding an operator had already resolved
// and email a second time about the same event.
//
// Nothing here guesses WHY: CardCom reports exactly one signal (IsActive =
// false) with no reason, and natural completion is already ruled out
// deterministically by resolveInactiveStatus before this point.
async function recordUnexplainedDeactivation(instruction, recurringId) {
  try {
    const finding = await recordFinding(db, {
      jobName: 'master_recurring_webhook',
      findingType: 'recurring_unexplained_inactive',
      severity: 'warning',
      subjectType: 'recurring_instruction',
      subjectId: instruction.id,
      details: {
        previousStatus: instruction.status,
        cardcomRecurringId: recurringId,
        note: 'CardCom reported IsActive=false without a reason, and this was not a Hamonym-initiated pause/cancel nor a deterministic natural completion. Reason unknown -- requires manual investigation.',
      },
    });
    if (!finding) return;

    adminNotifications.queueAdminNotification('recurring_unexplained_inactive', {
      incidentKey: `FINDING:recurring_unexplained_inactive:${finding.id}`,
      data: {
        findingId: finding.id,
        findingType: 'recurring_unexplained_inactive',
        jobName: 'master_recurring_webhook',
        subjectType: 'recurring_instruction',
        subjectId: instruction.id,
        foundAt: finding.found_at,
        details: {
          previousStatus: instruction.status,
          cardcomRecurringId: recurringId,
          entityId: instruction.entity_id,
          campaignId: instruction.campaign_id,
        },
      },
    });
  } catch (err) {
    // Observability must never break webhook processing: the status update
    // above is already committed and is the authoritative outcome of this
    // webhook.
    console.error('[master-recurring] failed to record unexplained deactivation:', err.message);
  }
}

exports.handle = async (payload) => {
  const recurringId = payload.RecurringId;
  if (!recurringId) return;

  const isActive = String(payload.IsActive).toLowerCase() === 'true';
  const nextDateToBill = parseSlashedDate(payload.NextDateToBill);

  const current = await db.query(
    `SELECT id, entity_id, campaign_id, status, total_installments
     FROM recurring_instructions WHERE cardcom_recurring_id = $1`,
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

  // AFTER the status update is committed (pool query, no open transaction) —
  // the finding and the email must never describe a state change that did not
  // land. See recordUnexplainedDeactivation's own header for why this is
  // gated on the transition rather than on the resulting status alone.
  if (status === 'inactive' && instruction.status !== 'inactive') {
    await recordUnexplainedDeactivation(instruction, recurringId);
  }
};
