// MASAV manual collection flow (Billing v1 Bundle 2, 2026-09-01; scoped
// down 2026-09-01 to a corrected v1 business boundary) --
// docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md section 7 + this
// task's Bundle 2 brief. MASAV has no API/callback in v1 -- masav.adapter.js
// stays NOT_IMPLEMENTED (Tranzila integration is explicitly out of scope
// here).
//
// CORRECTED v1 BOUNDARY: Hamonym's responsibility for a MASAV Statement
// ends when the export Excel file is generated for the operator to
// download -- approved Statement -> collection attempt -> Excel export ->
// operator downloads -> STOP. Submission to MASAV, actual collection, and
// handling of the MASAV result all happen manually outside Hamonym.
// recordMasavResult() / resolveAttempt() are deliberately NOT reachable
// from this module (or anywhere in the MASAV path) -- there is no
// in-app way to assert a MASAV financial outcome, create a Payment from a
// manually entered MASAV result, or transition a Statement to 'paid' based
// on one. CARD financial success remains the only path that can ever
// create a Payment, and it comes exclusively from
// cardcom-token-charge.adapter.js's real charge()/reconcile() calls.
//
// STATE AFTER EXPORT (implementation decision): a masav collection_attempt
// has no in-app-reachable transition out of 'pending' anymore (no
// recordMasavResult to move it to succeeded/declined/technical_failure).
// Deliberately NOT adding a new terminal-but-not-financial status (e.g.
// "exported") -- collection_attempts.status is DB-CHECK-constrained
// (migration 059, already run live) and a new value would need its own
// migration for a purely cosmetic distinction. 'pending' already reads
// correctly as "attempt open, awaiting external resolution", which is now
// permanently true for MASAV in v1 -- and it already blocks a second
// attempt from being opened on the same Statement (see
// ACTIVE_ATTEMPT_STATUSES below), which is the only behavior that mattered
// here. Re-exporting the same open attempt is harmless and allowed.
const pool = require('../../db/db');
const XLSX = require('xlsx');
const routing = require('./routing');
const { ACTIONABLE_STATEMENT_STATUSES, ACTIVE_ATTEMPT_STATUSES } = require('./collection.service');
const { recordFinding } = require('../../jobs/reconciliation-findings');

// Mirrors collection.service.js#openAttempt's locking/skip shape, but never
// calls an adapter -- MASAV in v1 has no charge() to call. Only ever opens
// an attempt when routing.resolveCollectionMethod independently agrees this
// Statement is masav-routed (total_due > threshold, bank details complete,
// explicitly authorized) -- this function does not re-decide routing, it
// defers to the same single source of truth collection.service.js uses.
async function openMasavAttempt(statementId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stmtRes = await client.query(
      `SELECT s.*, ba.entity_id
       FROM statements s
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
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

    if (!ACTIONABLE_STATEMENT_STATUSES.includes(statement.status)) {
      await client.query('COMMIT');
      return { skipped: true, reason: 'not_actionable', status: statement.status };
    }

    const activeRes = await client.query(
      `SELECT id FROM collection_attempts WHERE statement_id = $1 AND status = ANY($2::text[])`,
      [statementId, ACTIVE_ATTEMPT_STATUSES]
    );
    if (activeRes.rows[0]) {
      await client.query('COMMIT');
      return { skipped: true, reason: 'attempt_already_active', attemptId: activeRes.rows[0].id };
    }

    const routed = await routing.resolveCollectionMethod(client, statement);
    if (routed.method !== 'masav') {
      if (routed.blocked) {
        await recordFinding(client, {
          jobName: 'masav-collection',
          findingType: 'masav_blocked_pending_authorization',
          severity: 'warning',
          subjectType: 'statement',
          subjectId: statementId,
          details: { reason: routed.reason, entityId: statement.entity_id, totalDue: statement.total_due },
        });
      }
      await client.query('COMMIT');
      return { skipped: true, reason: routed.blocked ? routed.reason : 'not_masav_routed' };
    }

    const nextAttemptRes = await client.query(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next FROM collection_attempts WHERE statement_id = $1`,
      [statementId]
    );
    const attemptNumber = nextAttemptRes.rows[0].next;

    const insertRes = await client.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount, provider, status)
       VALUES ($1, 'masav', $2, $3, 'masav', 'pending')
       RETURNING id, attempt_number`,
      [statementId, attemptNumber, statement.total_due]
    );

    if (statement.status === 'approved') {
      await client.query(`UPDATE statements SET status = 'open' WHERE id = $1`, [statementId]);
    }

    await client.query('COMMIT');
    return {
      skipped: false,
      attemptId: insertRes.rows[0].id,
      attemptNumber: insertRes.rows[0].attempt_number,
      statementId,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Statements above the card threshold that cannot be routed to MASAV yet
// (not configured / incomplete / not authorized) and have no active
// collection attempt already in flight -- the operator-visible
// representation of the spec's 24-hour hold requirement (no automated
// timer in v1; the block itself is the visible, actionable state).
async function listBlockedStatements() {
  const { rows } = await pool.query(
    `SELECT s.id AS statement_id, s.total_due, s.status, s.created_at,
            ba.entity_id, e.display_name AS entity_name,
            emd.bank_code, emd.branch_code, emd.account_number, emd.authorized,
            CASE
              WHEN emd.entity_id IS NULL THEN 'masav_not_configured'
              WHEN emd.bank_code IS NULL OR emd.branch_code IS NULL OR emd.account_number IS NULL THEN 'masav_incomplete'
              WHEN NOT emd.authorized THEN 'masav_not_authorized'
            END AS reason
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     JOIN entities e ON e.id = ba.entity_id
     LEFT JOIN entity_masav_details emd ON emd.entity_id = ba.entity_id
     WHERE s.status = ANY($1::text[])
       AND s.total_due > $2
       AND (emd.entity_id IS NULL OR emd.authorized = false
            OR emd.bank_code IS NULL OR emd.branch_code IS NULL OR emd.account_number IS NULL)
       AND NOT EXISTS (
         SELECT 1 FROM collection_attempts ca WHERE ca.statement_id = s.id AND ca.status = ANY($3::text[])
       )
     ORDER BY s.created_at`,
    [ACTIONABLE_STATEMENT_STATUSES, routing.CARD_MASAV_THRESHOLD, ACTIVE_ATTEMPT_STATUSES]
  );
  return rows;
}

// Statements above the threshold, authorized for MASAV, actionable right
// now -- either still needing an attempt opened, or already sitting with a
// pending attempt ready for Excel export.
async function listActionableMasavStatements() {
  const { rows } = await pool.query(
    `SELECT s.id AS statement_id, s.total_due, s.status, s.created_at,
            ba.entity_id, e.display_name AS entity_name,
            emd.bank_code, emd.branch_code, emd.account_number,
            ca.id AS attempt_id, ca.status AS attempt_status, ca.attempt_number
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     JOIN entities e ON e.id = ba.entity_id
     JOIN entity_masav_details emd ON emd.entity_id = ba.entity_id AND emd.authorized = true
     LEFT JOIN collection_attempts ca ON ca.statement_id = s.id AND ca.status = ANY($3::text[])
     WHERE s.status = ANY($1::text[])
       AND s.total_due > $2
     ORDER BY s.created_at`,
    [ACTIONABLE_STATEMENT_STATUSES, routing.CARD_MASAV_THRESHOLD, ACTIVE_ATTEMPT_STATUSES]
  );
  return rows;
}

function ddmmyyyy(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Builds the manual MASAV batch export as an Excel (.xlsx) workbook -- v1's
// required output format, not CSV (see this module's header comment).
// Amount always comes straight from statements.total_due (the frozen
// Statement snapshot) -- never recalculated here. Column set is fixed to
// exactly the 11 fields this task's brief specifies (bank/branch/account/
// sum/tranmode/currency/company/contact/email/pdesc/remarks) -- no
// additional columns invented. Only includes statements that already have
// an open ('pending') masav collection attempt -- i.e. openMasavAttempt()
// must run first; exporting is not itself what marks a Statement as "being
// collected", and it never creates a Payment or moves a Statement to
// 'paid' -- see this module's header comment for why.
async function generateExportExcel(statementIds) {
  if (!Array.isArray(statementIds) || statementIds.length === 0) {
    const err = new Error('statementIds is required');
    err.code = 'MISSING_STATEMENT_IDS';
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT s.id AS statement_id, s.total_due, ba.entity_id,
            e.display_name AS entity_name, e.contact_full_name, e.contact_email,
            emd.bank_code, emd.branch_code, emd.account_number, emd.authorized,
            ca.id AS attempt_id, ca.status AS attempt_status,
            bp.period_start, bp.period_end
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     JOIN entities e ON e.id = ba.entity_id
     JOIN billing_periods bp ON bp.id = s.billing_period_id
     LEFT JOIN entity_masav_details emd ON emd.entity_id = ba.entity_id
     LEFT JOIN collection_attempts ca
       ON ca.statement_id = s.id AND ca.collection_method = 'masav' AND ca.status = 'pending'
     WHERE s.id = ANY($1::uuid[])`,
    [statementIds]
  );

  if (rows.length !== statementIds.length) {
    const err = new Error('One or more statement ids were not found');
    err.code = 'STATEMENT_NOT_FOUND';
    throw err;
  }
  for (const row of rows) {
    if (!row.authorized) {
      const err = new Error(`Statement ${row.statement_id} is not MASAV-authorized`);
      err.code = 'NOT_AUTHORIZED';
      throw err;
    }
    if (!row.attempt_id) {
      const err = new Error(`Statement ${row.statement_id} has no open MASAV collection attempt -- open one before exporting`);
      err.code = 'NO_OPEN_ATTEMPT';
      throw err;
    }
  }

  const header = ['bank', 'branch', 'account', 'sum', 'tranmode', 'currency', 'company', 'contact', 'email', 'pdesc', 'remarks'];
  const data = [header, ...rows.map((row) => [
    row.bank_code,
    row.branch_code,
    row.account_number,
    Number(row.total_due),
    'T',
    '1',
    row.entity_name,
    row.contact_full_name || '',
    row.contact_email || '',
    `עמלת Hamonym ${ddmmyyyy(row.period_start)}-${ddmmyyyy(row.period_end)}`,
    row.statement_id,
  ])];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MASAV');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  openMasavAttempt,
  listBlockedStatements,
  listActionableMasavStatements,
  generateExportExcel,
};
