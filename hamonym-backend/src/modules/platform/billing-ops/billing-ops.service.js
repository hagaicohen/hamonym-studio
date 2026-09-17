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
const getAdapter = require('../../collection-engine/adapters/get-adapter');
const { computeCalendarMonthUtcBoundary, ensurePeriod } = require('../../billing-engine/billing-period.util');

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

// Excludes retired periods (2026-09-17 Billing Ops filter UX fix) --
// `retired` already means "no longer the real period for its bounds"
// (ensurePeriod itself only ever matches WHERE retired = false when
// finding-or-creating), so an operator-facing list has no business
// showing them either. Found live: three sub-second test/harness periods
// from 2026-08-28 were already correctly marked retired=true (each has a
// real billing_run attached, making them permanently undeletable -- see
// migration triggers), but still showed up in the "כל החיובים" month
// filter as confusing raw timestamp ranges. This is a pure visibility
// fix -- retired rows are untouched, never modified or deleted.
// Backs the "החודש" tab's current/selected-period lookup and calculation
// flow only (2026-09-17 -- "כל החיובים" no longer builds its month filter
// from this list at all, see listStatements()'s own `month` param below,
// which queries billing_periods directly instead). Two conditions:
//   - retired = false: a retired row is never "the" period for its
//     window (see billing_periods.retired's own invariant) and must never
//     be offered as the current/creatable period.
//   - genuine calendar month: period_start sits exactly on a month
//     boundary (date_trunc('month', x) = x) AND period_end is exactly one
//     calendar month later -- the same shape computeCalendarMonthUtcBoundary()
//     always produces. Excludes the sub-second technical/harness periods
//     (already also caught by retired=false today, but this is the real
//     structural reason they'd never belong here even if one were ever
//     left non-retired) -- a data-quality filter, unrelated to whether a
//     period is a deliberate test fixture (there is no reliable way to
//     tell those apart from period properties alone, and this endpoint
//     doesn't need to: it's read-only-scoped to genuinely-shaped periods).
//   No time-horizon bound: history is real financial data and stays
//   queryable indefinitely (a 12-month cutoff was tried and reverted the
//   same day -- it fixed the immediate 2099-08 test-fixture symptom but
//   would have silently hidden genuine old months once the platform had
//   more than a year of real history, which is a worse problem).
exports.listPeriods = async () => {
  const { rows } = await pool.query(
    `SELECT p.*,
            (SELECT count(*) FROM billing_runs r WHERE r.billing_period_id = p.id) AS run_count
     FROM billing_periods p
     WHERE p.retired = false
       AND date_trunc('month', p.period_start) = p.period_start
       AND p.period_end = p.period_start + INTERVAL '1 month'
     ORDER BY p.period_start DESC`
  );
  return rows;
};

// "בחר חודש" -- the Platform Admin's manual-control entry point (Billing
// Ops operator-control hardening, 2026-09-13). Replaces free-typed
// period_start/period_end with a plain calendar month/year, and is
// idempotent by construction: computeCalendarMonthUtcBoundary + ensurePeriod
// are the exact same functions billing-monthly-cycle.job.js uses for "the
// previous calendar month" -- selecting "August 2026" here always resolves
// to the identical billing_periods row the automatic job would find/create
// for August, never a duplicate (enforced at the DB level too, by the
// billing_periods_no_overlap EXCLUDE constraint ensurePeriod already
// handles). Only writes an audit-log entry when a period is actually
// created -- finding an existing one is not an admin action with an effect.
exports.createPeriodForMonth = async ({ year, month, superAdminUserId, ip }) => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    const err = new Error('year and month (1-12) are required');
    err.code = 'MISSING_PERIOD_BOUNDS';
    throw err;
  }

  const { periodStart, periodEnd } = computeCalendarMonthUtcBoundary(y, m);
  const { periodId, periodCreated } = await ensurePeriod(pool, periodStart, periodEnd);

  if (periodCreated) {
    await auditLog(pool, {
      superAdminUserId,
      action: 'billing_period_create',
      notes: `period_start=${periodStart.toISOString()} period_end=${periodEnd.toISOString()} (month selector: ${y}-${String(m).padStart(2, '0')})`,
      ip,
    });
  }

  const { rows } = await pool.query(`SELECT * FROM billing_periods WHERE id = $1`, [periodId]);
  return { period: rows[0], created: periodCreated };
};

exports.calculatePeriod = async ({ periodId, asOf, superAdminUserId, ip }) => {
  const existingRun = await pool.query(
    `SELECT id FROM billing_runs WHERE billing_period_id = $1 LIMIT 1`,
    [periodId]
  );
  if (existingRun.rows[0]) {
    // Mirrors billing-monthly-cycle.job.js's own guard exactly (skip
    // calculation entirely once ANY billing_run exists for this period,
    // whether created by the job or a human) -- 2026-09-13 hardening. Before
    // this, the normal operator UI could re-invoke runProductionCalculation
    // on an already-calculated period behind a warning/confirm dialog; a
    // donation still eligible after an earlier, still-unapproved draft
    // Statement (eligibility is effective_statement_id IS NULL, not "not
    // already in some statement_components row") would be pulled into a
    // SECOND draft Statement, double-listing it. runProductionCalculation
    // itself has no such guard (by design -- it's a pure calculation
    // engine, not a policy layer), so every caller must enforce this; the
    // automatic job already did, this closes the same gap for the manual
    // path structurally, not just by hiding a button in the UI.
    const err = new Error('This billing period has already been calculated');
    err.code = 'PERIOD_ALREADY_CALCULATED';
    throw err;
  }

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

// "מה עושים עכשיו" -- one human-readable next action per Statement
// (Billing v1 simplicity decision, 2026-09-10). Pure presentation: every
// input here (readiness, status, latest_attempt_status) is already decided
// by existing authoritative logic (evaluateCollectionReadiness, itself a
// thin wrapper over routing.js -- see its own comment) or already selected
// by listStatements' own query. No new DB state, no new business rule --
// this function only chooses which existing fact to show as text. Kept
// server-side deliberately so the frontend never has to re-derive any of
// this from raw readiness/attempt data.
function nextActionLabel(statement, readiness, latestAttemptStatus) {
  if (statement.status === 'paid') return 'שולם';
  if (statement.status === 'draft') return 'ממתין לאישור';
  // approved / open from here on.
  if (readiness.route === 'card') {
    if (!readiness.ready) return 'חסר כרטיס אשראי';
    if (latestAttemptStatus === 'declined' || latestAttemptStatus === 'technical_failure' || latestAttemptStatus === 'not_found_confirmed') {
      return 'הגבייה נכשלה — נסה שוב';
    }
    return 'מוכן לגבייה';
  }
  // route === 'masav'
  if (!readiness.ready) return 'ממתין לאישור מס״ב';
  return 'ייצוא מס״ב';
}
exports.nextActionLabel = nextActionLabel; // exported for direct unit testing (pure function, no DB)

// routed_method here is a read-only DISPLAY projection of the same
// threshold+authorization rule routing.js applies authoritatively at
// collection time -- never used to decide anything, only to show the
// operator what will happen.
// Operator-facing status filter (2026-09-17 Billing Ops filter UX fix) --
// 'pending_collection'/'collection_failed' are NOT raw statements.status
// values. The מצב column already collapses status IN ('approved','open')
// into exactly these two operational buckets (see this frontend's own
// operationalStateLabel()/isCollectionFailed(), and nextActionLabel's own
// card-only gating comment above -- MASAV attempts can never carry a
// failure status, per the collection-attempt-reconciliation-masav-
// exclusion invariant, so this condition only ever fires for the real
// card-declined case it's meant to catch). Restructured into a CTE so
// routed_method/latest_attempt_status are computed exactly once and
// referenced by both the result columns and this filter, instead of
// duplicating the CASE/subquery text -- one definition, not two.
const COLLECTION_FAILED_SQL = `routed_method = 'card' AND latest_attempt_status IN ('declined', 'technical_failure', 'not_found_confirmed')`;
// The direct negation of COLLECTION_FAILED_SQL, written out rather than
// wrapped in NOT(...) -- SQL's three-valued logic means NOT(x AND NULL) is
// NULL, not TRUE, so a card-routed Statement with no attempt yet
// (latest_attempt_status IS NULL, the normal "never tried" case) would be
// wrongly excluded from "ממתין לגבייה" by a naive NOT(). This mirrors
// isCollectionFailed()'s own JS semantics exactly (Array.includes(null) is
// false, not "unknown"), just spelled out for SQL's different null rules.
const NOT_COLLECTION_FAILED_SQL = `(routed_method != 'card' OR latest_attempt_status IS NULL OR latest_attempt_status NOT IN ('declined', 'technical_failure', 'not_found_confirmed'))`;

// `month` ("YYYY-MM", 2026-09-17 month-picker redesign) is a pure read
// filter: the operator picks any calendar month -- past, present or
// future, with no dependency on a billing_periods row existing for it --
// and this resolves it to that month's real canonical boundaries via the
// SAME computeCalendarMonthUtcBoundary() the automatic job and "בחר חודש"
// both already use, then matches Statements whose billing_period_id
// points at a billing_periods row with those exact bounds. Deliberately
// NOT filtered by retired: a Statement is real, permanent financial
// history regardless of whether its billing_periods row was later
// retired (retired only ever means "not the current/active row for this
// window", never "not real" -- see billing_periods.retired's own
// invariant). No new billing_periods/billing_runs row is ever created
// here -- a month with nothing to show just returns zero rows.
function monthToBoundary(month) {
  if (!month) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const year = m ? Number(m[1]) : NaN;
  const monthNum = m ? Number(m[2]) : NaN;
  if (!m || monthNum < 1 || monthNum > 12) {
    throw Object.assign(new Error('Invalid month format, expected YYYY-MM'), { code: 'INVALID_MONTH' });
  }
  const { periodStart, periodEnd } = computeCalendarMonthUtcBoundary(year, monthNum);
  return { periodStart, periodEnd };
}

exports.listStatements = async ({ periodId, runId, status, month }) => {
  const boundary = monthToBoundary(month);
  const { rows } = await pool.query(
    `WITH scored AS (
       SELECT s.id, s.billing_account_id, s.billing_period_id, s.billing_run_id,
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
         AND ($5::timestamptz IS NULL OR s.billing_period_id IN (
               SELECT id FROM billing_periods WHERE period_start = $5 AND period_end = $6
             ))
     )
     SELECT * FROM scored
     WHERE $3::text IS NULL
        OR ($3 = 'collection_failed' AND status IN ('approved', 'open') AND ${COLLECTION_FAILED_SQL})
        OR ($3 = 'pending_collection' AND status IN ('approved', 'open') AND ${NOT_COLLECTION_FAILED_SQL})
        OR ($3 NOT IN ('collection_failed', 'pending_collection') AND status = $3)
     ORDER BY created_at DESC`,
    [
      periodId || null, runId || null, status || null, routing.CARD_MASAV_THRESHOLD,
      boundary ? boundary.periodStart.toISOString() : null,
      boundary ? boundary.periodEnd.toISOString() : null,
    ]
  );

  // next_action ("מה עושים עכשיו") only needs a real readiness check for
  // approved/open statements -- draft/paid are answered by status alone
  // (see nextActionLabel), so this never queries entity_masav_details/
  // entity_billing for a statement that doesn't need it. At today's row
  // counts this per-row check is simplicity over premature batching; see
  // routing.js's own comment on the (unconsolidated, frozen) duplicate
  // routed_method CASE above for the same tradeoff already accepted there.
  await Promise.all(rows.map(async (row) => {
    if (row.status !== 'approved' && row.status !== 'open') {
      row.next_action = nextActionLabel(row, null, null);
      return;
    }
    const readiness = await evaluateCollectionReadiness(row);
    row.next_action = nextActionLabel(row, readiness, row.latest_attempt_status);
  }));

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

// Manual "check with provider" for one past Collection Attempt (Billing v1
// post-launch hardening, 2026-09-07) -- lets a Super Admin safely ask
// CardCom what it has on file for a SPECIFIC past attempt, without ever
// creating a new charge or minting a new ExternalUniqTranId. Reuses two
// already-proven primitives verbatim, never reimplementing either:
//   - adapters/cardcom-token-charge.adapter.js#reconcile({attemptId}) --
//     read-only GetTransactionByExternalUniqTran lookup keyed on the SAME
//     attemptId originally submitted to charge(); mints nothing new.
//   - collection.service.js#resolveAttempt -- the exact function the live
//     Router and collection-attempt-reconciliation.job.js both already use
//     to finalize an attempt/Statement/Payment from an outcome. Calling it
//     again on an already-resolved attempt is safe (no precondition on
//     current status; payments.collection_attempt_id / (provider,
//     provider_reference) UNIQUE make a duplicate 'succeeded' outcome a
//     harmless no-op the second time, not a double Payment).
//
// One outcome value is deliberately NOT handed to resolveAttempt as-is:
// 'not_found' is not a valid collection_attempts.status (see migration
// 059's CHECK constraint and adapters/adapter.contract.js's own warning) --
// collection-attempt-reconciliation.job.js already follows this same rule
// (it skips resolveAttempt entirely for not_found, leaving the row
// untouched for a future re-check). This function does the same: a
// not_found lookup result changes nothing about the attempt/Statement, it
// only gets reported back to the caller and audit-logged.
//
// 'not_found_confirmed' (migration 064) is intentionally a DIFFERENT string
// and falls through the `!== 'not_found'` check below like any other
// resolved outcome -- it IS handed to resolveAttempt and persisted as a
// real terminal status (see adapter.contract.js). That's deliberate: it is
// CardCom's own documented, authoritative "no successful transaction"
// answer (ResponseCode 9998), not the same provisional/might-not-be-
// indexed-yet situation 'not_found' represents.
const RECONCILE_UNIQUE_VIOLATION = '23505';

exports.reconcileCollectionAttempt = async ({ attemptId, superAdminUserId, ip }) => {
  const attemptRes = await pool.query(
    `SELECT id, statement_id, collection_method, status FROM collection_attempts WHERE id = $1`,
    [attemptId]
  );
  const attempt = attemptRes.rows[0];
  if (!attempt) {
    const err = new Error('Collection attempt not found');
    err.code = 'ATTEMPT_NOT_FOUND';
    throw err;
  }

  if (attempt.collection_method !== 'card') {
    // masav has no reconcile capability at all today (adapters/masav.adapter.js
    // is NOT_IMPLEMENTED) -- rejected here, before ever touching getAdapter,
    // so this never risks invoking a stub's non-existent reconcile().
    const err = new Error(`Reconcile with provider is not supported for collection_method=${attempt.collection_method}`);
    err.code = 'RECONCILE_NOT_SUPPORTED_FOR_METHOD';
    throw err;
  }

  // Same defensive shape as collection.service.js#runCollectionForStatement's
  // own adapter.charge() try/catch -- never let the adapter's own thrown
  // exception (as opposed to a returned {outcome:'ambiguous', ...}) surface
  // as an unhandled error; treat it identically to an ambiguous lookup.
  let outcome;
  try {
    outcome = await getAdapter('card').reconcile({ attemptId });
  } catch (err) {
    outcome = { outcome: 'ambiguous', failureReason: err.message };
  }

  if (outcome.outcome !== 'not_found') {
    try {
      await collection.resolveAttempt(attemptId, attempt.statement_id, outcome);
    } catch (err) {
      if (err.code !== RECONCILE_UNIQUE_VIOLATION) throw err;
      // Same idempotency guarantee collection-attempt-reconciliation.job.js
      // already relies on for exactly this scenario: payments.
      // collection_attempt_id / (provider, provider_reference) UNIQUE means
      // a repeat 'succeeded' outcome for an attempt already resolved (by an
      // earlier call to this same function, the live Router, or the
      // scheduled job) hits the DB constraint instead of inserting a second
      // Payment -- resolveAttempt's whole transaction rolls back, the
      // attempt/Statement are left exactly as the earlier resolution left
      // them, and this is that expected losing side, not an error to
      // surface to the operator.
    }
  }

  const [attemptAfterRes, statementAfterRes] = await Promise.all([
    pool.query(
      `SELECT status, provider_reference, provider_raw_status, failure_reason FROM collection_attempts WHERE id = $1`,
      [attemptId]
    ),
    pool.query(`SELECT status FROM statements WHERE id = $1`, [attempt.statement_id]),
  ]);

  await pool.query(
    `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
     VALUES ($1, 'billing_collection_attempt_reconcile', $2, $3)`,
    [
      superAdminUserId,
      `attemptId=${attemptId} statementId=${attempt.statement_id} outcome=${outcome.outcome} providerRawStatus=${outcome.providerRawStatus || ''} providerReference=${outcome.providerReference || ''}`,
      ip || null,
    ]
  );

  return {
    attemptId,
    statementId: attempt.statement_id,
    outcome: outcome.outcome,
    attemptStatus: attemptAfterRes.rows[0]?.status || null,
    statementStatus: statementAfterRes.rows[0]?.status || null,
    providerReference: outcome.providerReference || null,
    providerRawStatus: outcome.providerRawStatus || null,
    failureReason: outcome.failureReason || null,
  };
};
