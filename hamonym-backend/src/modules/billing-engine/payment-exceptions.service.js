// FIN-11 Stage 2B (2026-10) — Payment Exception lifecycle. Approved
// overpayment policy (docs/finance/FIN11_DECISION_LOG.md): a verified
// overpayment is recorded in full (never clamped), an exception is opened,
// new platform-fee collection from that ENTITY is held until a Super Admin
// reviews it, and no refund/credit is ever executed automatically -- there
// is no refund/credit execution mechanism in this codebase (verified by
// grep, not assumed; see the technical design doc). This module only ever
// RECORDS decisions; it never moves money.
//
// The detection itself (INSERT INTO payment_exceptions) happens inline
// inside collection.service.js#resolveAttempt's own transaction -- it MUST
// be atomic with the payment write that caused it, so it is not exposed as
// a separate function here. This module covers only what happens AFTER
// detection: checking the hold, lifting it early, and recording a
// resolution decision -- each its own separate, later, admin-triggered
// action with its own transaction.
const pool = require('../../db/db');

// Checked by collection.service.js#openAttempt and
// getFin11CappedCardProposal (Stage 2A) before opening/proposing any new
// card collection -- rule 4.9. Scoped to the ENTITY (every Statement of
// that entity), not just the Statement that triggered the exception,
// exactly as decided. Read-only; client is optional so it can run either
// standalone or under an existing lock (e.g. inside openAttempt's own
// transaction, after the Statement row is already locked).
exports.hasOpenCollectionHold = async (entityId, client = pool) => {
  const res = await client.query(
    `SELECT id FROM payment_exceptions
     WHERE entity_id = $1 AND status = 'open' AND hold_new_collection = true
     LIMIT 1`,
    [entityId]
  );
  return res.rows.length > 0 ? { held: true, exceptionId: res.rows[0].id } : { held: false };
};

// Rule 4.10: a Super Admin may explicitly lift the hold BEFORE the
// exception itself is resolved, with a recorded reason. Does NOT change
// `status` -- the exception stays 'open' (still awaiting a real
// resolution), only `hold_new_collection` flips to false. Append-only
// action log entry records who/when/why, same convention as every other
// admin action in this module family (applyStatementAdjustment, etc.).
exports.overrideCollectionHold = async ({ exceptionId, superAdminUserId, reason }) => {
  if (!superAdminUserId) {
    const err = new Error('superAdminUserId is required');
    err.code = 'MISSING_ADMIN_USER';
    throw err;
  }
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    const err = new Error('reason is required');
    err.code = 'MISSING_REASON';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const excRes = await client.query(`SELECT id, status FROM payment_exceptions WHERE id = $1 FOR UPDATE`, [exceptionId]);
    const exception = excRes.rows[0];
    if (!exception) {
      const err = new Error('Payment exception not found');
      err.code = 'EXCEPTION_NOT_FOUND';
      throw err;
    }
    if (exception.status !== 'open') {
      const err = new Error(`Exception ${exceptionId} is already ${exception.status}`);
      err.code = 'EXCEPTION_NOT_OPEN';
      throw err;
    }

    await client.query(`UPDATE payment_exceptions SET hold_new_collection = false WHERE id = $1`, [exceptionId]);
    await client.query(
      `INSERT INTO payment_exception_actions (exception_id, action_type, super_admin_user_id, reason)
       VALUES ($1, 'override_hold', $2, $3)`,
      [exceptionId, superAdminUserId, trimmedReason]
    );

    await client.query('COMMIT');
    return { exceptionId, holdLifted: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const RESOLUTION_TYPES = ['resolve_refund', 'resolve_credit', 'resolve_no_overpayment'];

// Records a resolution DECISION only. Per the explicit instruction: this
// must never pretend a refund or credit was actually executed -- there is
// no execution mechanism for either in this codebase. Closing the
// exception (status='resolved') is a bookkeeping statement ("a Super Admin
// has decided what should happen"), not a statement that money has moved.
// Execution, confirmation, and closure are deliberately kept separate
// (see the technical design doc's "deferred work" section) -- this
// function only ever covers the decision step.
exports.resolvePaymentException = async ({ exceptionId, resolutionType, superAdminUserId, reason, evidenceNotes }) => {
  if (!superAdminUserId) {
    const err = new Error('superAdminUserId is required');
    err.code = 'MISSING_ADMIN_USER';
    throw err;
  }
  if (!RESOLUTION_TYPES.includes(resolutionType)) {
    const err = new Error(`resolutionType must be one of: ${RESOLUTION_TYPES.join(', ')}`);
    err.code = 'INVALID_RESOLUTION_TYPE';
    throw err;
  }
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    const err = new Error('reason is required');
    err.code = 'MISSING_REASON';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const excRes = await client.query(`SELECT id, status FROM payment_exceptions WHERE id = $1 FOR UPDATE`, [exceptionId]);
    const exception = excRes.rows[0];
    if (!exception) {
      const err = new Error('Payment exception not found');
      err.code = 'EXCEPTION_NOT_FOUND';
      throw err;
    }
    if (exception.status !== 'open') {
      const err = new Error(`Exception ${exceptionId} is already ${exception.status}`);
      err.code = 'EXCEPTION_NOT_OPEN';
      throw err;
    }

    // Resolving also implicitly lifts the hold -- an exception that's been
    // decided (even "we're issuing a refund manually, outside this
    // system") is no longer a reason to keep blocking this entity's future
    // collection forever. If the decision itself requires a continued
    // hold for some other reason, that is a separate, later admin action.
    await client.query(`UPDATE payment_exceptions SET status = 'resolved', hold_new_collection = false WHERE id = $1`, [exceptionId]);
    await client.query(
      `INSERT INTO payment_exception_actions (exception_id, action_type, super_admin_user_id, reason, evidence_notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [exceptionId, resolutionType, superAdminUserId, trimmedReason, evidenceNotes || null]
    );

    await client.query('COMMIT');
    return { exceptionId, status: 'resolved', resolutionType };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
