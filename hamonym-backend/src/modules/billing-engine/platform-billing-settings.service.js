// One system-wide VAT rate, managed by Platform Admin in exactly one place
// (2026-09-14i product decision, migration 066). Replaces the old model
// where vat_rate lived per-billing_account, set once at creation with no
// way to change it for an existing account. Fee rate is untouched --
// billing_accounts.fee_rate remains the per-association commercial term.
//
// getCurrentVatRate is the read path calculation.service.js calls at
// Statement-calculation time; the value it returns gets copied into
// statements.vat_rate and frozen forever by the pre-existing
// trg_statements_enforce_immutability trigger (migration 054) -- this
// module never touches an existing Statement, so a rate change here only
// ever affects Statements calculated after the change.
const pool = require('../../db/db');

// Accepts an optional client so calculation.service.js can read the current
// rate inside its own per-account transaction (same connection, no separate
// round-trip pool).
exports.getCurrentVatRate = async (client = pool) => {
  const { rows } = await client.query(`SELECT vat_rate FROM platform_billing_settings WHERE id = 1`);
  if (!rows[0]) {
    const err = new Error('platform_billing_settings row missing (expected exactly one row, id=1)');
    err.code = 'PLATFORM_VAT_SETTING_MISSING';
    throw err;
  }
  return rows[0].vat_rate;
};

exports.getSetting = async () => {
  const { rows } = await pool.query(
    `SELECT vat_rate, updated_at, updated_by FROM platform_billing_settings WHERE id = 1`
  );
  return rows[0] || null;
};

exports.setVatRate = async ({ vatRate, superAdminUserId, ip }) => {
  if (vatRate === undefined || vatRate === null || Number.isNaN(Number(vatRate))) {
    const err = new Error('vatRate is required');
    err.code = 'MISSING_VAT_RATE';
    throw err;
  }
  if (Number(vatRate) < 0 || Number(vatRate) >= 1) {
    const err = new Error('vatRate must be a fraction between 0 and 1 (e.g. 0.18 for 18%)');
    err.code = 'INVALID_VAT_RATE';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`SELECT vat_rate FROM platform_billing_settings WHERE id = 1`);
    const res = await client.query(
      `UPDATE platform_billing_settings SET vat_rate = $1, updated_at = NOW(), updated_by = $2
       WHERE id = 1 RETURNING vat_rate, updated_at`,
      [vatRate, superAdminUserId]
    );

    // Reuses platform_audit_log the same way every other Platform Admin
    // action does -- entity_id is NULL because this is a platform-level
    // setting, not tied to any one association.
    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, NULL, 'platform_vat_rate_update', $2, $3)`,
      [superAdminUserId, `vat_rate ${before.rows[0]?.vat_rate ?? 'unset'} -> ${vatRate}`, ip || null]
    );

    await client.query('COMMIT');
    return res.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
