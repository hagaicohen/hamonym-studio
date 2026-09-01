// Calculation Service — Phase 1 (frozen design, 2026-08-28). Selects paid,
// real, not-yet-consumed donations for a billing period and produces DRAFT
// Statements only. Approval (draft -> approved / draft -> abandoned) and
// Collection are explicitly out of scope here — a separate future action
// owns the transition that actually sets donations.effective_statement_id
// (the real, DB-enforced, write-once consumption marker; see migration
// 058). This module never writes that column.
//
// Deliberately placed under billing-engine/, not billing/ — the existing
// src/modules/billing/ module is an unrelated legacy feature (entity card
// tokenization against Hamonym's own Cardcom terminal, table
// `entity_billing`), flagged as a naming collision in the E2E audit. Not
// touched here.
const pool = require('../../db/db');
const notifications = require('./billing-setup-notification.service');

const EFFECTIVE_STATEMENT_STATUSES = ['approved', 'open', 'paid', 'cancelled', 'written_off'];

function deriveOriginType(donation) {
  if (donation.recurring_instruction_id) return 'recurring_charge';
  if (donation.source) return 'manual_entry';
  return 'card_onetime';
}

// All money arithmetic happens inside Postgres as NUMERIC — never routed
// through a JS Number — so there is no binary floating-point rounding
// ambiguity anywhere in the fee/VAT/total chain. VAT is charged on the fee
// (a professional service commission), not on the gross donation total.
// fee_amount is rounded first, and vat_amount is computed from that
// already-rounded fee_amount, not from the unrounded product — this is
// what makes total_due = fee_amount + vat_amount reconcile exactly, with
// no separate fudge-cent correction, matching the statements table's own
// CHECK constraint.
async function computeAmounts(client, donationIds, feeRate, vatRate) {
  const res = await client.query(
    `WITH agg AS (
       SELECT SUM(amount) AS gross_raised FROM donations WHERE id = ANY($1::uuid[])
     ), fee AS (
       SELECT gross_raised, ROUND(gross_raised * $2::numeric, 2) AS fee_amount FROM agg
     )
     SELECT gross_raised, fee_amount, ROUND(fee_amount * $3::numeric, 2) AS vat_amount,
            fee_amount + ROUND(fee_amount * $3::numeric, 2) AS total_due
     FROM fee`,
    [donationIds, feeRate, vatRate]
  );
  return res.rows[0];
}

// Selects eligible donations and, if any exist, creates exactly one draft
// Statement + its statement_components for this account+period, all inside
// the caller's transaction (client). Eligibility is `effective_statement_id
// IS NULL` — NOT "not already present in any statement_components row" —
// a donation whose only prior appearances are abandoned/still-draft
// calculation attempts remains eligible (see migration 058's comment for
// why the append-only components table can never itself be the eligibility
// check).
//
// Returns { zeroActivity: true } without writing anything if there are no
// eligible donations — a zero-value Statement is never created; the caller
// records the skip in the run's own result_summary instead.
async function calculateAccountStatement(client, account, { billingRunId, periodStart, periodEnd }) {
  const donationsRes = await client.query(
    `SELECT id, amount, billing_effective_at, completed_at, recurring_instruction_id, source
     FROM donations
     WHERE entity_id = $1
       AND status = 'paid' AND is_mock = false
       AND billing_effective_at >= $2 AND billing_effective_at < $3
       AND effective_statement_id IS NULL
     ORDER BY billing_effective_at`,
    [account.entity_id, periodStart, periodEnd]
  );

  if (donationsRes.rows.length === 0) {
    return { zeroActivity: true };
  }

  const donationIds = donationsRes.rows.map((d) => d.id);
  const amounts = await computeAmounts(client, donationIds, account.fee_rate, account.vat_rate);

  const stmtRes = await client.query(
    `INSERT INTO statements (
       billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate,
       fee_amount, vat_amount, total_due, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')
     RETURNING id`,
    [
      account.id, billingRunId, amounts.gross_raised, account.fee_rate, account.vat_rate,
      amounts.fee_amount, amounts.vat_amount, amounts.total_due,
    ]
  );
  const statementId = stmtRes.rows[0].id;

  for (const donation of donationsRes.rows) {
    await client.query(
      `INSERT INTO statement_components (
         statement_id, donation_id, amount_snapshot, completed_at_snapshot,
         billing_effective_at_snapshot, origin_type
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        statementId, donation.id, donation.amount, donation.completed_at,
        donation.billing_effective_at, deriveOriginType(donation),
      ]
    );
  }

  return {
    zeroActivity: false,
    statementId,
    donationCount: donationsRes.rows.length,
    grossRaised: amounts.gross_raised,
    feeAmount: amounts.fee_amount,
    vatAmount: amounts.vat_amount,
    totalDue: amounts.total_due,
  };
}

// Top-level orchestrator: one billing_run (mode='production', status
// stays 'draft' throughout — Calculation never approves anything), one
// dedicated transaction per billing_account so one account's failure never
// rolls back another's already-committed draft Statement.
//
// Billing-readiness correction (2026-09-02): a missing/suspended
// billing_account must never make real donation activity disappear from
// Billing — see the audit that triggered this (13 real paid August
// donations, 2 real active entities, 0 billing_accounts, previously 0
// accountsEvaluated and thus invisible). The engine now runs three stages:
//   A) discover every active entity with real, eligible donation activity
//      in this period, independent of billing_accounts entirely;
//   B) the existing per-account loop below is unchanged — it is still the
//      only thing that ever creates a Statement (Stage C);
//   C) any discovered entity NOT covered by an active billing_account is
//      reported (never a financial mutation) and the entity administrator
//      notified, deduplicated per (entity, period, reason) — see
//      billing-setup-notification.service.js / migration 062.
// Stage A's eligibility predicate is intentionally identical to
// calculateAccountStatement's own (paid, non-mock, in-window,
// effective_statement_id IS NULL) — discovery must never see activity that
// Stage C itself would not also consider eligible, and discovery alone
// never writes effective_statement_id (only Approval does — unchanged).
async function runProductionCalculation(billingPeriodId, asOf) {
  const periodRes = await pool.query(
    `SELECT period_start, period_end FROM billing_periods WHERE id = $1`,
    [billingPeriodId]
  );
  const period = periodRes.rows[0];
  if (!period) {
    const err = new Error(`billing_period ${billingPeriodId} not found`);
    err.code = 'BILLING_PERIOD_NOT_FOUND';
    throw err;
  }

  const runRes = await pool.query(
    `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
     VALUES ($1, 'production', $2, 'draft', NOW())
     RETURNING id`,
    [billingPeriodId, asOf]
  );
  const billingRunId = runRes.rows[0].id;

  // ---- Stage A: activity discovery ------------------------------------
  const activityRes = await pool.query(
    `SELECT d.entity_id, e.display_name,
            COUNT(*)::int AS donation_count, SUM(d.amount) AS gross_amount
     FROM donations d
     JOIN entities e ON e.id = d.entity_id AND e.status = 'active'
     WHERE d.status = 'paid' AND d.is_mock = false
       AND d.billing_effective_at >= $1 AND d.billing_effective_at < $2
       AND d.effective_statement_id IS NULL
     GROUP BY d.entity_id, e.display_name`,
    [period.period_start, period.period_end]
  );

  const summary = {
    accountsEvaluated: 0,
    statementsCreated: 0,
    zeroActivityAccountIds: [],
    errors: [],
    activityDiscovered: {
      entitiesWithActivity: activityRes.rows.length,
      totalDonations: activityRes.rows.reduce((sum, r) => sum + r.donation_count, 0),
      totalGross: activityRes.rows.reduce((sum, r) => sum + Number(r.gross_amount), 0),
    },
    blockedEntities: [],
  };

  // ---- Stage B/C: unchanged financial path for entities that already
  // have an active billing_account -----------------------------------
  const accountsRes = await pool.query(
    `SELECT id, entity_id, fee_rate, vat_rate FROM billing_accounts WHERE enforcement_status = 'active'`
  );

  const coveredEntityIds = new Set();
  for (const account of accountsRes.rows) {
    coveredEntityIds.add(account.entity_id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const outcome = await calculateAccountStatement(client, account, {
        billingRunId, periodStart: period.period_start, periodEnd: period.period_end,
      });
      await client.query('COMMIT');
      summary.accountsEvaluated++;
      if (outcome.zeroActivity) summary.zeroActivityAccountIds.push(account.id);
      else summary.statementsCreated++;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      summary.errors.push({ accountId: account.id, message: err.message });
    } finally {
      client.release();
    }
  }

  // ---- Stage B (readiness) for entities with real activity but no
  // active billing_account: report + notify, never a Statement, never a
  // donation write of any kind. This loop is the actual fix — previously
  // these entities were simply absent from every field above.
  const uncoveredEntities = activityRes.rows.filter((r) => !coveredEntityIds.has(r.entity_id));
  if (uncoveredEntities.length > 0) {
    const uncoveredIds = uncoveredEntities.map((r) => r.entity_id);
    const existingAccountsRes = await pool.query(
      `SELECT entity_id, enforcement_status FROM billing_accounts WHERE entity_id = ANY($1::uuid[])`,
      [uncoveredIds]
    );
    const statusByEntity = new Map(existingAccountsRes.rows.map((r) => [r.entity_id, r.enforcement_status]));

    for (const row of uncoveredEntities) {
      // Only two reasons are possible today: fee_rate/vat_rate are NOT NULL
      // with no default (migration 054) — there is no "account exists but
      // partially configured" state in the current schema. 'suspended' is
      // the only non-active enforcement_status value (same CHECK).
      const reason = statusByEntity.has(row.entity_id) ? 'account_suspended' : 'no_billing_account';
      const blockedEntity = {
        entityId: row.entity_id,
        displayName: row.display_name,
        donationCount: row.donation_count,
        grossAmount: row.gross_amount,
        reason,
      };
      summary.blockedEntities.push(blockedEntity);

      try {
        blockedEntity.notification = await notifications.notifyBillingSetupRequired({
          entityId: row.entity_id,
          entityName: row.display_name,
          billingPeriodId,
          blockingReason: reason,
          donationCount: row.donation_count,
          grossAmount: row.gross_amount,
        });
      } catch (err) {
        blockedEntity.notification = { sent: false, reason: 'error', message: err.message };
      }
    }
  }

  await pool.query(
    `UPDATE billing_runs SET result_summary = $2, completed_at = NOW() WHERE id = $1`,
    [billingRunId, JSON.stringify(summary)]
  );

  return { billingRunId, ...summary };
}

module.exports = {
  runProductionCalculation,
  calculateAccountStatement,
  computeAmounts,
  deriveOriginType,
  EFFECTIVE_STATEMENT_STATUSES,
};
