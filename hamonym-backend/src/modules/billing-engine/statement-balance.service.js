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
const calculation = require('./calculation.service');
const platformBillingSettings = require('./platform-billing-settings.service');
const { computeIsraeliCutoffUtcInstant } = require('./billing-period.util');

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

// Fold Late Donations (FIN-11 Stage 1, 2026-10). Attaches donations that
// completed AFTER this statement's own period closed, through the end of
// that same calendar month (Israel time), to THIS statement -- reusing
// calculateAccountStatement's exact component/origin_type logic, never
// duplicating or drifting from it. The three writes (components,
// adjustment, effective_statement_id) happen in one transaction so a
// donation's financial trail is always fully attributable: its
// statement_components row explains WHICH statement captured it, its
// contribution is reflected in getStatementBalance() via the matching
// statement_adjustments row, and effective_statement_id (write-once,
// migration 058) permanently excludes it from ever being picked up by a
// future period's calculateAccountStatement -- that query's own eligibility
// filter (effective_statement_id IS NULL) needs no change at all.
//
// Late window = [this statement's period_end, start of the NEXT Israel
// calendar month). NOT the next 28-28 cycle -- that would just be the
// following month's own, separate, normal calculation. Computed via the
// same AT TIME ZONE double-conversion idiom already proven in
// billing-period.util.js#computeIsraeliCutoffUtcInstant (DST-safe, verified
// against real Postgres tzdata, not assumed here either).
//
// Statuses: 'approved'/'open'/'paid' are foldable -- NOT 'draft' (an
// unapproved statement should still go through ordinary Calculation/
// re-approval, not this correction path) and NOT the terminal statuses.
// This is a judgment call, not dictated by any existing constraint --
// flagged for explicit confirmation, not a discovered blocker.
//
// Idempotent and concurrency-safe by construction, not by a special-case
// guard: FOR UPDATE on the statement row (locks first, same order as
// applyStatementAdjustment/openAttempt) plus FOR UPDATE on the candidate
// donation rows themselves. A second call (re-run, or a genuinely
// concurrent one) re-evaluates eligibility under those locks and finds
// nothing (effective_statement_id is no longer NULL) -- a clean no-op, not
// an error, not a duplicate.
const FOLDABLE_STATEMENT_STATUSES = ['approved', 'open', 'paid'];

exports.foldLateDonationsIntoStatement = async ({ statementId, superAdminUserId, ip }) => {
  if (!superAdminUserId) {
    const err = new Error('superAdminUserId is required');
    err.code = 'MISSING_ADMIN_USER';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stmtRes = await client.query(
      `SELECT s.id, s.status, s.fee_rate, ba.entity_id, bp.period_end
       FROM statements s
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       JOIN billing_periods bp ON bp.id = s.billing_period_id
       WHERE s.id = $1
       FOR UPDATE OF s`,
      [statementId]
    );
    const statement = stmtRes.rows[0];
    if (!statement) {
      const err = new Error('Statement not found');
      err.code = 'STATEMENT_NOT_FOUND';
      throw err;
    }
    if (!FOLDABLE_STATEMENT_STATUSES.includes(statement.status)) {
      const err = new Error(`Statement is ${statement.status}; late donations cannot be folded into it`);
      err.code = 'STATEMENT_NOT_FOLDABLE';
      throw err;
    }

    // Period-model guard: late-folding only makes sense for a genuine 28->28
    // cycle, where period_end is the mid-month cutoff and "the rest of the
    // calendar month" is a short, well-defined trailing window. A historical
    // calendar-month-shaped period (billing-period.util.js's OLD model, kept
    // forever for real history through September 2026) has period_end sitting
    // at the 1st of its own next month already -- treating that as a
    // mid-month cutoff would silently claim an entire following month's
    // donations. Detected structurally (does period_end actually equal the
    // real 28th-20:00-Israel cutoff instant for its own Israel-local month?),
    // reusing billing-period.util.js's own cutoff formula -- never a
    // hardcoded "before/after this date" check, so this can't drift out of
    // sync with that module's own model boundary.
    const localDateRes = await client.query(
      `SELECT EXTRACT(YEAR FROM ($1::timestamptz AT TIME ZONE 'Asia/Jerusalem'))::int AS yr,
              EXTRACT(MONTH FROM ($1::timestamptz AT TIME ZONE 'Asia/Jerusalem'))::int AS mo`,
      [statement.period_end]
    );
    const { yr, mo } = localDateRes.rows[0];
    const expectedCutoff = await computeIsraeliCutoffUtcInstant(client, yr, mo);
    if (expectedCutoff.getTime() !== new Date(statement.period_end).getTime()) {
      const err = new Error(
        `Statement ${statementId}'s billing period is not a 28->28 cycle (period_end does not match the ` +
        `28th-20:00-Israel cutoff) -- likely a historical calendar-month period; late-donation folding is not supported for it`
      );
      err.code = 'STATEMENT_PERIOD_NOT_FOLDABLE';
      throw err;
    }

    const windowRes = await client.query(
      `SELECT (date_trunc('month', $1::timestamptz AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '1 month')
                AT TIME ZONE 'Asia/Jerusalem' AS late_window_end`,
      [statement.period_end]
    );
    const lateWindowEnd = windowRes.rows[0].late_window_end;

    const donationsRes = await client.query(
      `SELECT id, amount, billing_effective_at, completed_at, recurring_instruction_id, source
       FROM donations
       WHERE entity_id = $1
         AND status = 'paid' AND is_mock = false
         AND effective_statement_id IS NULL
         AND billing_effective_at >= $2 AND billing_effective_at < $3
       ORDER BY billing_effective_at
       FOR UPDATE`,
      [statement.entity_id, statement.period_end, lateWindowEnd]
    );

    if (donationsRes.rows.length === 0) {
      await client.query('COMMIT');
      return { folded: false, reason: 'no_late_donations', donationCount: 0 };
    }

    const donationIds = donationsRes.rows.map((d) => d.id);
    const vatRate = await platformBillingSettings.getCurrentVatRate(client);
    const amounts = await calculation.computeAmounts(client, donationIds, statement.fee_rate, vatRate);

    for (const donation of donationsRes.rows) {
      await client.query(
        `INSERT INTO statement_components (
           statement_id, donation_id, amount_snapshot, completed_at_snapshot,
           billing_effective_at_snapshot, origin_type
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          statementId, donation.id, donation.amount, donation.completed_at,
          donation.billing_effective_at, calculation.deriveOriginType(donation),
        ]
      );
    }

    const deltaAmount = Number(amounts.fee_amount) + Number(amounts.vat_amount);
    await client.query(
      `INSERT INTO statement_adjustments (statement_id, delta_amount, reason, created_by_user_id)
       VALUES ($1, $2, $3, $4)`,
      [
        statementId, deltaAmount,
        `Late donations folded in: ${donationIds.length} donation(s) — ${donationIds.join(',')}`,
        superAdminUserId,
      ]
    );

    await client.query(
      `UPDATE donations SET effective_statement_id = $1 WHERE id = ANY($2::uuid[])`,
      [statementId, donationIds]
    );

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, 'statement_late_donations_folded', $3, $4)`,
      [
        superAdminUserId, statement.entity_id,
        `statementId=${statementId} donationCount=${donationIds.length} deltaAmount=${deltaAmount} donationIds=${donationIds.join(',')}`,
        ip || null,
      ]
    );

    const balance = await exports.getStatementBalance(statementId, client);

    await client.query('COMMIT');
    return { folded: true, donationCount: donationIds.length, donationIds, deltaAmount, balance };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
