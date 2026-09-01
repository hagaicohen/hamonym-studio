// Billing Account Provisioning (2026-08-28) — the one place a
// billing_accounts row is allowed to come into existence. Deliberately a
// standalone Super Admin action, never triggered implicitly by Calculation,
// donation flows, or entity approval: fee_rate/vat_rate are a commercial
// term Hamonym sets, not something the entity declares or the system should
// infer. See migration 054's comment on billing_accounts — fee_rate/vat_rate
// are NOT NULL with no DEFAULT specifically so nothing can silently
// substitute a value here.
const pool = require('../../db/db');

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

exports.getBillingAccountByEntityId = async (entityId) => {
  const { rows } = await pool.query(
    `SELECT * FROM billing_accounts WHERE entity_id = $1`,
    [entityId]
  );
  return rows[0] || null;
};

// Creation must receive fee_rate/vat_rate/preferred_collection_method
// explicitly from the caller (the Super Admin route) — this function never
// substitutes a default itself, matching the DB constraint one level up.
exports.createBillingAccount = async ({
  entityId,
  feeRate,
  vatRate,
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
  if (vatRate === undefined || vatRate === null) {
    const err = new Error('vatRate is required');
    err.code = 'MISSING_VAT_RATE';
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
        notes || `fee_rate=${feeRate} vat_rate=${vatRate} preferred_collection_method=${preferredCollectionMethod}`,
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
