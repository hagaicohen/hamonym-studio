// Billing Operations (Billing v1 Bundle 1, 2026-09-01) -- the Super Admin
// operator surface that wires the already-built, already-proven engines
// (calculation.service.js, approval.service.js, collection.service.js)
// into something an operator can actually drive end to end:
// Billing Period -> Production Calculation -> Statement -> Review ->
// Approval -> Dynamic Routing -> Collection -> Payment -> Statement paid.
//
// This module never re-implements any financial logic itself -- it only
// creates/lists periods, calls the existing services, and reads back state
// for display. See routing.js for the routed_method displayed in
// listStatements -- duplicated here as SQL for read-only display only;
// the authoritative decision is still made inside collection.service.js at
// the moment of an actual collection attempt.
const pool = require('../../../db/db');
const calculation = require('../../billing-engine/calculation.service');
const approval = require('../../billing-engine/approval.service');
const collection = require('../../collection-engine/collection.service');
const routing = require('../../collection-engine/routing');
const billingRepository = require('../../billing/billing.repository');

// Read-only collection-readiness projection (Billing Collection UX
// truthfulness fix, 2026-09-02) -- mirrors, never re-implements, the exact
// same checks collection.service.js#openAttempt applies authoritatively
// inside its own row-locked transaction: routing.js's threshold+MASAV-
// authorization rule, then -- for the card route only -- entity_billing's
// active default instrument. Used to (a) give the operator drawer a
// truthful state instead of the old always-selects-nothing routed_method
// bug, and (b) as triggerCollection's defense-in-depth pre-check below.
// The real, race-safe gate stays inside openAttempt's own transaction --
// this is a fast-fail preview of the same rule, not a replacement for it.
async function evaluateCollectionReadiness(statement) {
  const routed = await routing.resolveCollectionMethod(pool, statement);
  if (routed.blocked) {
    return { route: 'masav', ready: false, reason: routed.reason };
  }
  if (routed.method === 'card') {
    const instrument = await billingRepository.getActiveDefaultByEntityId(statement.entity_id);
    return instrument
      ? { route: 'card', ready: true, reason: null }
      : { route: 'card', ready: false, reason: 'no_active_payment_instrument' };
  }
  // routed.method === 'masav' -- routing.js only returns this once MASAV is
  // configured, complete, AND authorized, so this is already ready.
  return { route: 'masav', ready: true, reason: null };
}

async function auditLog(client, { superAdminUserId, entityId, action, notes, ip }) {
  await client.query(
    `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [superAdminUserId, entityId || null, action, notes || null, ip || null]
  );
}

exports.listPeriods = async () => {
  const { rows } = await pool.query(
    `SELECT p.*,
            (SELECT count(*) FROM billing_runs r WHERE r.billing_period_id = p.id) AS run_count
     FROM billing_periods p
     ORDER BY p.period_start DESC`
  );
  return rows;
};

exports.createPeriod = async ({ periodStart, periodEnd, superAdminUserId, ip }) => {
  if (!periodStart || !periodEnd) {
    const err = new Error('periodStart and periodEnd are required');
    err.code = 'MISSING_PERIOD_BOUNDS';
    throw err;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING *`,
      [periodStart, periodEnd]
    );
    await auditLog(client, {
      superAdminUserId, action: 'billing_period_create',
      notes: `period_start=${periodStart} period_end=${periodEnd}`, ip,
    });
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23P01') {
      const overlap = new Error('This period overlaps an existing billing period');
      overlap.code = 'PERIOD_OVERLAP';
      throw overlap;
    }
    throw err;
  } finally {
    client.release();
  }
};

exports.calculatePeriod = async ({ periodId, asOf, superAdminUserId, ip }) => {
  const effectiveAsOf = asOf || new Date().toISOString();
  const result = await calculation.runProductionCalculation(periodId, effectiveAsOf);
  await pool.query(
    `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
     VALUES ($1, 'billing_calculation_trigger', $2, $3)`,
    [superAdminUserId, `periodId=${periodId} asOf=${effectiveAsOf} runId=${result.billingRunId} statementsCreated=${result.statementsCreated}`, ip || null]
  );
  return result;
};

exports.listRuns = async ({ periodId }) => {
  const { rows } = await pool.query(
    `SELECT * FROM billing_runs WHERE ($1::uuid IS NULL OR billing_period_id = $1) ORDER BY created_at DESC`,
    [periodId || null]
  );
  return rows;
};

// routed_method here is a read-only DISPLAY projection of the same
// threshold+authorization rule routing.js applies authoritatively at
// collection time -- never used to decide anything, only to show the
// operator what will happen.
exports.listStatements = async ({ periodId, runId, status }) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.billing_account_id, s.billing_period_id, s.billing_run_id,
            s.gross_raised, s.fee_amount, s.vat_amount, s.total_due, s.status, s.created_at,
            ba.entity_id, e.display_name AS entity_name,
            (SELECT count(*)::int FROM statement_components sc WHERE sc.statement_id = s.id) AS component_count,
            CASE
              WHEN s.total_due <= $4 THEN 'card'
              WHEN emd.entity_id IS NOT NULL AND emd.authorized
                   AND emd.bank_code IS NOT NULL AND emd.branch_code IS NOT NULL AND emd.account_number IS NOT NULL
                THEN 'masav'
              ELSE 'blocked'
            END AS routed_method,
            (SELECT ca.status FROM collection_attempts ca WHERE ca.statement_id = s.id
             ORDER BY ca.attempt_number DESC LIMIT 1) AS latest_attempt_status,
            (SELECT count(*) FROM payments p WHERE p.statement_id = s.id)::int AS payment_count
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     JOIN entities e ON e.id = ba.entity_id
     LEFT JOIN entity_masav_details emd ON emd.entity_id = ba.entity_id
     WHERE ($1::uuid IS NULL OR s.billing_period_id = $1)
       AND ($2::uuid IS NULL OR s.billing_run_id = $2)
       AND ($3::text IS NULL OR s.status = $3)
     ORDER BY s.created_at DESC`,
    [periodId || null, runId || null, status || null, routing.CARD_MASAV_THRESHOLD]
  );
  return rows;
};

exports.getStatementDetail = async (statementId) => {
  const stmtRes = await pool.query(
    `SELECT s.*, ba.entity_id, e.display_name AS entity_name,
            ba.preferred_collection_method AS account_declared_method
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     JOIN entities e ON e.id = ba.entity_id
     WHERE s.id = $1`,
    [statementId]
  );
  const statement = stmtRes.rows[0];
  if (!statement) return null;

  const [attempts, payments, componentCount, readiness] = await Promise.all([
    pool.query(`SELECT * FROM collection_attempts WHERE statement_id = $1 ORDER BY attempt_number`, [statementId]),
    pool.query(`SELECT * FROM payments WHERE statement_id = $1 ORDER BY received_at`, [statementId]),
    pool.query(`SELECT count(*)::int AS n FROM statement_components WHERE statement_id = $1`, [statementId]),
    evaluateCollectionReadiness(statement),
  ]);

  return {
    ...statement,
    // Root-cause fix: this query never selected routed_method before (that
    // CASE only existed in listStatements), so the frontend's
    // routedMethodLabel(undefined) silently fell through to a hardcoded
    // 'חסום' default regardless of the real route. readiness is now the
    // single source of truth the drawer renders from.
    routed_method: readiness.route,
    readiness,
    attempts: attempts.rows,
    payments: payments.rows,
    componentCount: componentCount.rows[0].n,
  };
};

exports.approveStatement = async ({ statementId, superAdminUserId, ip }) => {
  const result = await approval.approveStatement(statementId);
  await pool.query(
    `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
     VALUES ($1, 'billing_statement_approve', $2, $3)`,
    [superAdminUserId, `statementId=${statementId}`, ip || null]
  );
  return result;
};

// Orchestration only -- never a mass SQL status update. Each id goes
// through approval.approveStatement() exactly as the single-statement path
// does (own BEGIN/COMMIT/ROLLBACK, row locks, revalidation, claim checks),
// called sequentially and independently so a failure on one statement can
// never roll back or block another. One platform_audit_log row per
// successfully approved statement -- same 'billing_statement_approve'
// action as the single-approve path, not one row for "bulk action X" -- so
// the audit trail reads identically either way. A statement that fails is
// never logged as approved.
exports.bulkApproveStatements = async ({ statementIds, superAdminUserId, ip }) => {
  if (!Array.isArray(statementIds) || statementIds.length === 0) {
    const err = new Error('statementIds must be a non-empty array of statement ids');
    err.code = 'MISSING_STATEMENT_IDS';
    throw err;
  }

  const results = [];
  for (const statementId of statementIds) {
    try {
      const result = await approval.approveStatement(statementId);
      await pool.query(
        `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
         VALUES ($1, 'billing_statement_approve', $2, $3)`,
        [superAdminUserId, `statementId=${statementId} bulk=true`, ip || null]
      );
      results.push({ id: statementId, success: true, result });
    } catch (err) {
      results.push({
        id: statementId,
        success: false,
        error: { code: err.code || 'APPROVAL_FAILED', message: err.message, details: err.details || {} },
      });
    }
  }

  const approvedCount = results.filter((r) => r.success).length;
  return { total: results.length, approvedCount, failedCount: results.length - approvedCount, results };
};

exports.abandonStatement = async ({ statementId, superAdminUserId, ip }) => {
  const result = await approval.abandonStatement(statementId);
  await pool.query(
    `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
     VALUES ($1, 'billing_statement_abandon', $2, $3)`,
    [superAdminUserId, `statementId=${statementId}`, ip || null]
  );
  return result;
};

// The only entry point that can trigger a real CardCom charge for a
// Statement (requirement 7/10 of Bundle 1). A masav-routed or otherwise
// blocked Statement is rejected up front (NOT_COLLECTION_READY, see
// evaluateCollectionReadiness above) before this ever calls into the
// collection engine; a card-routed Statement missing a payment instrument
// is caught the same way. It never fakes success and never falls back to a
// different rail.
exports.triggerCollection = async ({ statementId, superAdminUserId, ip }) => {
  const stmtRes = await pool.query(
    `SELECT s.total_due, ba.entity_id
     FROM statements s JOIN billing_accounts ba ON ba.id = s.billing_account_id
     WHERE s.id = $1`,
    [statementId]
  );
  const statement = stmtRes.rows[0];
  if (!statement) {
    const err = new Error('Statement not found');
    err.code = 'STATEMENT_NOT_FOUND';
    throw err;
  }

  // Defense-in-depth (Billing Collection UX truthfulness fix, 2026-09-02):
  // reject a non-ready Statement here, before ever calling into the
  // collection engine, instead of relying solely on openAttempt's own
  // guard further downstream. Never looser than that guard -- same rule,
  // same source (evaluateCollectionReadiness above) -- only earlier and
  // with an explicit typed rejection instead of a silent 200 skip. This is
  // additive: openAttempt's transaction-locked check is untouched and
  // still runs (and remains the actual race-safe gate) for every request
  // that passes this pre-check.
  const readiness = await evaluateCollectionReadiness(statement);
  if (readiness.route !== 'card' || !readiness.ready) {
    const err = new Error(
      `Statement is not collection-ready via this endpoint (route=${readiness.route}, ready=${readiness.ready}, reason=${readiness.reason || 'masav_routed_not_actionable_here'})`
    );
    err.code = 'NOT_COLLECTION_READY';
    err.details = { route: readiness.route, ready: readiness.ready, reason: readiness.reason };
    throw err;
  }

  const result = await collection.runCollectionForStatement(statementId);
  await pool.query(
    `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
     VALUES ($1, 'billing_collection_trigger', $2, $3)`,
    [superAdminUserId, `statementId=${statementId} result=${JSON.stringify(result)}`, ip || null]
  );
  return result;
};
