// Statement Balance (2026-10, FIN — statement correction design, foundation
// step only). Pure read: computes the four numbers a correction needs to
// distinguish, reusing the existing money ledgers exactly as they already
// are -- statements.total_due (frozen by migration 054, never touched
// here), statement_adjustments (migration 072, append-only), and payments
// (migration 059, already append-only, already the "money actually moved"
// ledger). Nothing here writes anything, and nothing here is wired into
// collection/routing/status yet -- that is a deliberate later step, not
// this one, per the 2026-10 decision to connect it carefully rather than
// all at once. In particular, this does NOT yet account for amounts
// requested by an active (pending/ambiguous) collection_attempts row --
// that is exactly the double-collection-prevention piece the next step
// must add before this feeds collection decisions.
const pool = require('../../db/db');

exports.getStatementBalance = async (statementId, client = pool) => {
  const stmtRes = await client.query(
    `SELECT total_due FROM statements WHERE id = $1`,
    [statementId]
  );
  const statement = stmtRes.rows[0];
  if (!statement) {
    const err = new Error('Statement not found');
    err.code = 'STATEMENT_NOT_FOUND';
    throw err;
  }
  const originalTotal = Number(statement.total_due);

  const adjRes = await client.query(
    `SELECT COALESCE(SUM(delta_amount), 0) AS total FROM statement_adjustments WHERE statement_id = $1`,
    [statementId]
  );
  const adjustmentTotal = Number(adjRes.rows[0].total);

  const paidRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE statement_id = $1`,
    [statementId]
  );
  const collected = Number(paidRes.rows[0].total);

  const adjustedTotal = originalTotal + adjustmentTotal;
  const outstanding = adjustedTotal - collected;

  return { originalTotal, adjustedTotal, collected, outstanding };
};

// Statement Adjustment write path (2026-10, FIN). Super Admin authorization
// itself is the caller's route middleware's job (same convention as every
// other admin action in this module, e.g. createBillingAccount) -- this
// function just requires and records superAdminUserId, exactly like that
// one does.
//
// Locks the statements row with SELECT ... FOR UPDATE before anything else
// -- same order collection.service.js#openAttempt already locks in, so the
// two can never interleave once openAttempt is updated to take the same
// lock (a later step, not this one; see that audit's finding #2/#3).
//
// Only approved/paid statements are adjustable -- draft is rejected because
// Calculation (not a correction) is the right tool pre-approval, and no
// other status (open/cancelled/written_off/abandoned) was named as allowed,
// so none are, per "keep changes minimal".
//
// Rejects outright if any pending/ambiguous collection_attempts row exists
// for this statement -- the in-flight-adjustment race this audit's finding
// #3 identified. This is the one safeguard implemented now; openAttempt
// itself is NOT yet updated to read getStatementBalance() or to take this
// same lock -- that remains a separate, later step.
const ADJUSTABLE_STATEMENT_STATUSES = ['approved', 'paid'];

exports.applyStatementAdjustment = async ({ statementId, deltaAmount, reason, superAdminUserId, ip }) => {
  const delta = Number(deltaAmount);
  if (!Number.isFinite(delta) || delta === 0) {
    const err = new Error('deltaAmount is required and must be a non-zero number');
    err.code = 'INVALID_DELTA_AMOUNT';
    throw err;
  }
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    const err = new Error('reason is required');
    err.code = 'MISSING_REASON';
    throw err;
  }
  if (!superAdminUserId) {
    const err = new Error('superAdminUserId is required');
    err.code = 'MISSING_ADMIN_USER';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stmtRes = await client.query(
      `SELECT id, status FROM statements WHERE id = $1 FOR UPDATE`,
      [statementId]
    );
    const statement = stmtRes.rows[0];
    if (!statement) {
      const err = new Error('Statement not found');
      err.code = 'STATEMENT_NOT_FOUND';
      throw err;
    }
    if (!ADJUSTABLE_STATEMENT_STATUSES.includes(statement.status)) {
      const err = new Error(`Statement is ${statement.status}; adjustments are only allowed on approved or paid statements`);
      err.code = 'STATEMENT_NOT_ADJUSTABLE';
      throw err;
    }

    const activeAttemptRes = await client.query(
      `SELECT id FROM collection_attempts WHERE statement_id = $1 AND status IN ('pending', 'ambiguous')`,
      [statementId]
    );
    if (activeAttemptRes.rows[0]) {
      const err = new Error('A collection attempt is in flight for this statement');
      err.code = 'ACTIVE_COLLECTION_ATTEMPT';
      throw err;
    }

    await client.query(
      `INSERT INTO statement_adjustments (statement_id, delta_amount, reason, created_by_user_id)
       VALUES ($1, $2, $3, $4)`,
      [statementId, delta, trimmedReason, superAdminUserId]
    );

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
       VALUES ($1, 'statement_adjustment_create', $2, $3)`,
      [superAdminUserId, `statementId=${statementId} deltaAmount=${delta} reason=${trimmedReason}`, ip || null]
    );

    // Read under the same held lock/transaction -- the adjustment just
    // inserted is visible to its own transaction, no second round-trip.
    const balance = await exports.getStatementBalance(statementId, client);

    await client.query('COMMIT');
    return balance;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// Reopen for Collection (2026-10, FIN). A positive adjustment on a 'paid'
// statement raises outstanding above zero (applyStatementAdjustment allows
// this deliberately), but collection.service.js#openAttempt only acts on
// ACTIONABLE_STATEMENT_STATUSES = ['approved', 'open'] -- 'paid' is
// excluded, so the new balance is otherwise uncollectible. This function
// does exactly one thing -- flip 'paid' -> 'open' -- and nothing else: no
// call to openAttempt, no charge. Collection remains the Super Admin's own
// separate, explicit next click, through the existing, unmodified
// openAttempt, where every current safeguard (active-attempt lock,
// idempotency, the outstanding<=0 guard) already applies unchanged.
//
// Same lock-then-check order as applyStatementAdjustment/openAttempt, so
// none of the three can ever interleave on the same statement.
exports.reopenStatementForCollection = async (statementId, superAdminUserId, ip) => {
  if (!superAdminUserId) {
    const err = new Error('superAdminUserId is required');
    err.code = 'MISSING_ADMIN_USER';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stmtRes = await client.query(
      `SELECT id, status FROM statements WHERE id = $1 FOR UPDATE`,
      [statementId]
    );
    const statement = stmtRes.rows[0];
    if (!statement) {
      const err = new Error('Statement not found');
      err.code = 'STATEMENT_NOT_FOUND';
      throw err;
    }
    if (statement.status !== 'paid') {
      const err = new Error(`Statement is ${statement.status}, not paid; nothing to reopen`);
      err.code = 'STATEMENT_NOT_PAID';
      throw err;
    }

    const activeAttemptRes = await client.query(
      `SELECT id FROM collection_attempts WHERE statement_id = $1 AND status IN ('pending', 'ambiguous')`,
      [statementId]
    );
    if (activeAttemptRes.rows[0]) {
      const err = new Error('A collection attempt is in flight for this statement');
      err.code = 'ACTIVE_COLLECTION_ATTEMPT';
      throw err;
    }

    const balance = await exports.getStatementBalance(statementId, client);
    if (balance.outstanding <= 0) {
      const err = new Error('No outstanding balance to collect');
      err.code = 'NO_OUTSTANDING_BALANCE';
      throw err;
    }

    await client.query(`UPDATE statements SET status = 'open' WHERE id = $1`, [statementId]);

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
       VALUES ($1, 'statement_reopen_for_collection', $2, $3)`,
      [superAdminUserId, `statementId=${statementId} outstanding=${balance.outstanding}`, ip || null]
    );

    await client.query('COMMIT');
    return { statementId, status: 'open', outstanding: balance.outstanding };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
