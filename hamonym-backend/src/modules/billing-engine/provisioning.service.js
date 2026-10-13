// Billing Account Provisioning (2026-08-28) — the one place a
// billing_accounts row is allowed to come into existence. fee_rate is a
// commercial term Hamonym sets per association, not something the entity
// declares or the system should infer — see migration 054's comment on
// billing_accounts, fee_rate is NOT NULL with no DEFAULT specifically so
// nothing can silently substitute a value here. (Updated 2026-10, FIN-01: no
// longer true that this is never triggered implicitly — platform.service.js
// #setStatus now calls createBillingAccount automatically on an entity's
// first approval, at the standard 3% rate, as its own explicit post-commit
// step. This function itself is unchanged; only the "standalone-only" claim
// above was.)
//
// vat_rate is no longer an operator-supplied input (2026-09-14i — VAT
// globalized to one Platform-level setting, migration 066). The column is
// kept for compatibility (still NOT NULL) but is auto-populated here from
// platform_billing_settings at creation time; calculation.service.js never
// reads it back off this row.
const pool = require('../../db/db');
const platformBillingSettings = require('./platform-billing-settings.service');
const calculation = require('./calculation.service');

// entities.billing_method predates billing_accounts and has no FK/sync to
// it (see the entity_billing/billing_accounts audit, 2026-08-28) — surfaced
// here purely as a hint for whoever is provisioning, never written back to
// or trusted as the actual preferred_collection_method.
exports.listUnprovisionedActiveEntities = async () => {
  const { rows } = await pool.query(
    `SELECT e.id, e.display_name, e.billing_method AS declared_billing_method,
            COALESCE(paid.donation_count, 0)::int AS paid_donation_count,
            COALESCE(paid.gross_total, 0) AS paid_gross_total
     FROM entities e
     LEFT JOIN (
       SELECT entity_id, COUNT(*) AS donation_count, SUM(amount) AS gross_total
       FROM donations
       WHERE status = 'paid' AND is_mock = false
       GROUP BY entity_id
     ) paid ON paid.entity_id = e.id
     WHERE e.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM billing_accounts ba WHERE ba.entity_id = e.id)
     ORDER BY COALESCE(paid.gross_total, 0) DESC, e.display_name`
  );
  return rows;
};

// One combined billing-readiness list for the Platform Admin "הגדרות
// עמותות" tab (UX simplification pass, 2026-09-14) -- merges what used to
// be two separate screens (the unprovisioned list above, and per-entity
// fee/VAT/MASAV lookups on platform-billing-setup-page) into a single
// read-only projection: every active entity, whether or not it has a
// billing_account yet, with enough of its MASAV state to answer "is this
// entity ready to be billed" without a second round-trip per row. Never
// used to create/modify anything -- creation still goes through
// createBillingAccount above, one entity at a time, with its own explicit
// confirmation step.
exports.listBillingReadiness = async () => {
  const { rows } = await pool.query(
    `SELECT e.id, e.display_name,
            ba.id AS billing_account_id, ba.fee_rate, ba.vat_rate,
            ba.enforcement_status, ba.preferred_collection_method,
            emd.authorized AS masav_authorized,
            -- Real bank details filled in, not merely "a row exists" --
            -- 2026-09-16, once uploadAuthorizationDocument() started
            -- allowing the authorization document to be uploaded before
            -- bank details are saved (an entity_masav_details row can now
            -- exist with bank_code/branch_code/account_number still ''),
            -- row-existence alone would show a misleading "הוגדר" here for
            -- an entity that only has a document on file.
            (emd.bank_code IS NOT NULL AND emd.bank_code <> '' AND emd.branch_code <> '' AND emd.account_number <> '') AS masav_configured,
            COALESCE(paid.donation_count, 0)::int AS paid_donation_count,
            COALESCE(paid.gross_total, 0) AS paid_gross_total
     FROM entities e
     LEFT JOIN billing_accounts ba ON ba.entity_id = e.id
     LEFT JOIN entity_masav_details emd ON emd.entity_id = e.id
     LEFT JOIN (
       SELECT entity_id, COUNT(*) AS donation_count, SUM(amount) AS gross_total
       FROM donations
       WHERE status = 'paid' AND is_mock = false
       GROUP BY entity_id
     ) paid ON paid.entity_id = e.id
     WHERE e.status = 'active'
     ORDER BY (ba.id IS NULL) DESC, COALESCE(paid.gross_total, 0) DESC, e.display_name`
  );
  return rows;
};

exports.getBillingAccountByEntityId = async (entityId) => {
  const { rows } = await pool.query(
    `SELECT * FROM billing_accounts WHERE entity_id = $1`,
    [entityId]
  );
  return rows[0] || null;
};

// Creation must receive fee_rate/preferred_collection_method explicitly
// from the caller (the Super Admin route) — this function never substitutes
// a default for fee_rate itself, matching the DB constraint one level up.
// vat_rate is not a caller input (see file header) — it's read from the
// current platform setting inside the same transaction.
exports.createBillingAccount = async ({
  entityId,
  feeRate,
  preferredCollectionMethod,
  enforcementStatus,
  masavCeiling,
  superAdminUserId,
  notes,
  ip,
}) => {
  if (feeRate === undefined || feeRate === null) {
    const err = new Error('feeRate is required');
    err.code = 'MISSING_FEE_RATE';
    throw err;
  }
  if (!preferredCollectionMethod) {
    const err = new Error('preferredCollectionMethod is required');
    err.code = 'MISSING_COLLECTION_METHOD';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entityRes = await client.query(
      `SELECT id, status FROM entities WHERE id = $1`,
      [entityId]
    );
    if (!entityRes.rows[0]) {
      const err = new Error('Entity not found');
      err.code = 'ENTITY_NOT_FOUND';
      throw err;
    }

    const vatRate = await platformBillingSettings.getCurrentVatRate(client);

    const insertRes = await client.query(
      `INSERT INTO billing_accounts (
         entity_id, fee_rate, vat_rate, preferred_collection_method,
         enforcement_status, masav_ceiling
       ) VALUES ($1, $2, $3, $4, COALESCE($5, 'active'), $6)
       RETURNING *`,
      [entityId, feeRate, vatRate, preferredCollectionMethod, enforcementStatus, masavCeiling ?? null]
    );

    // Reuses the existing platform_audit_log — same accountability trail as
    // every other Super Admin action (entities.service.js's setStatus etc.)
    // rather than adding a parallel created_by column to billing_accounts.
    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, 'billing_account_create', $3, $4)`,
      [
        superAdminUserId,
        entityId,
        notes || `fee_rate=${feeRate} vat_rate=${vatRate} (system) preferred_collection_method=${preferredCollectionMethod}`,
        ip || null,
      ]
    );

    await client.query('COMMIT');
    return insertRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    // Unique violation on entities(id) -> billing_accounts.entity_id UNIQUE
    if (err.code === '23505') {
      const dup = new Error('Entity already has a billing account');
      dup.code = 'BILLING_ACCOUNT_ALREADY_EXISTS';
      throw dup;
    }
    throw err;
  } finally {
    client.release();
  }
};

// Supplemental Calculation (2026-10, FIN-02) — covers an entity that
// genuinely missed its billing period's one production Calculation run
// (e.g. its billing_account was provisioned after that run already
// executed — see FIN-01). Deliberately reuses calculateAccountStatement
// verbatim under the EXISTING run's billing_run_id, rather than re-running
// runProductionCalculation for the whole period: the schema already
// supports this (trg_statements_enforce_production_run only requires
// mode='production' and derives billing_period_id from the run itself,
// migration 054) and re-running the full period would re-process every
// already-covered account, each landing a second draft Statement on top of
// the first (nothing marks a donation "claimed" until Approval -- see
// migration 058 -- so Calculation alone has no natural duplicate guard).
//
// Concurrency (mandatory per the 2026-10 decision -- a plain check-then-
// insert is not enough): locks the billing_accounts row with SELECT ... FOR
// UPDATE before checking for an existing Statement, the same "lock, then
// re-read, then decide" idiom approval.service.js already uses for its own
// concurrent-approval race. A second concurrent call blocks on that lock
// until the first's transaction commits or rolls back, then its own
// re-check (inside the same transaction, after acquiring the lock) sees the
// first's already-committed Statement under ordinary READ COMMITTED
// visibility -- so it returns { alreadyExists: true } instead of creating a
// second draft, with no chance of a lost-update race.
exports.calculateSupplementalStatement = async ({ periodId, entityId, superAdminUserId, ip }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const accountRes = await client.query(
      `SELECT * FROM billing_accounts WHERE entity_id = $1 FOR UPDATE`,
      [entityId]
    );
    const account = accountRes.rows[0];
    if (!account) {
      const err = new Error('Entity has no billing account');
      err.code = 'NO_BILLING_ACCOUNT';
      throw err;
    }
    if (account.enforcement_status !== 'active') {
      const err = new Error('Billing account is not active');
      err.code = 'BILLING_ACCOUNT_NOT_ACTIVE';
      throw err;
    }

    const periodRes = await client.query(
      `SELECT id, period_start, period_end FROM billing_periods WHERE id = $1`,
      [periodId]
    );
    const period = periodRes.rows[0];
    if (!period) {
      const err = new Error('Billing period not found');
      err.code = 'BILLING_PERIOD_NOT_FOUND';
      throw err;
    }

    const runRes = await client.query(
      `SELECT id FROM billing_runs WHERE billing_period_id = $1 AND mode = 'production' ORDER BY created_at DESC LIMIT 1`,
      [periodId]
    );
    const run = runRes.rows[0];
    if (!run) {
      const err = new Error('This period has not been calculated yet');
      err.code = 'PERIOD_NOT_CALCULATED';
      throw err;
    }

    // Re-check AFTER acquiring the account lock, inside this same
    // transaction -- covers both a genuinely repeated request and the
    // concurrent-request case described above. Any status counts (draft,
    // approved, whatever) -- never create a second row regardless.
    const existingRes = await client.query(
      `SELECT * FROM statements WHERE billing_account_id = $1 AND billing_period_id = $2`,
      [account.id, periodId]
    );
    if (existingRes.rows[0]) {
      await client.query('COMMIT');
      return { alreadyExists: true, statement: existingRes.rows[0] };
    }

    const result = await calculation.calculateAccountStatement(client, account, {
      billingRunId: run.id,
      periodStart: period.period_start,
      periodEnd: period.period_end,
    });

    if (result.zeroActivity) {
      await client.query('COMMIT');
      return { zeroActivity: true };
    }

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, 'billing_supplemental_calculation', $3, $4)`,
      [
        superAdminUserId, entityId,
        `periodId=${periodId} runId=${run.id} statementId=${result.statementId} totalDue=${result.totalDue}`,
        ip || null,
      ]
    );

    await client.query('COMMIT');
    return { alreadyExists: false, zeroActivity: false, ...result };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
