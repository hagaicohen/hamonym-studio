// MASAV structured banking configuration + explicit authorization
// (Billing v1 Bundle 2, 2026-09-01). See migration 060 +
// docs/HAMONYM_BILLING_ENGINE_SPEC.md's MASAV section.
//
// Deliberately three separate actions (configure / authorize / revoke) --
// configuring bank details never implies authorization, per this task's
// explicit correction ("Do NOT infer authorization from ... presence of
// banking fields"). Authorization is only ever set by authorize()/revoke(),
// never as a side effect of upsertBankDetails().
const pool = require('../../db/db');

exports.getByEntityId = async (entityId) => {
  const { rows } = await pool.query(`SELECT * FROM entity_masav_details WHERE entity_id = $1`, [entityId]);
  return rows[0] || null;
};

// Editing bank details always clears any existing authorization -- an
// authorization is a Super Admin's attestation about a *specific* account
// number; changing the account must never leave a stale authorization
// silently applying to the new one. The DB CHECK (migration 060) also
// enforces authorized/authorized_by/authorized_at moving together.
exports.upsertBankDetails = async ({ entityId, bankCode, branchCode, accountNumber, accountHolderName, superAdminUserId, ip }) => {
  if (!bankCode || !branchCode || !accountNumber) {
    const err = new Error('bankCode, branchCode and accountNumber are all required');
    err.code = 'MISSING_BANK_DETAILS';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entityRes = await client.query(`SELECT id FROM entities WHERE id = $1`, [entityId]);
    if (!entityRes.rows[0]) {
      const err = new Error('Entity not found');
      err.code = 'ENTITY_NOT_FOUND';
      throw err;
    }

    const { rows } = await client.query(
      `INSERT INTO entity_masav_details (entity_id, bank_code, branch_code, account_number, account_holder_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (entity_id) DO UPDATE SET
         bank_code = EXCLUDED.bank_code,
         branch_code = EXCLUDED.branch_code,
         account_number = EXCLUDED.account_number,
         account_holder_name = EXCLUDED.account_holder_name,
         authorized = false, authorized_by = NULL, authorized_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [entityId, bankCode, branchCode, accountNumber, accountHolderName || null]
    );

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, 'masav_bank_details_upsert', $3, $4)`,
      [superAdminUserId, entityId, `bank=${bankCode} branch=${branchCode} account=${accountNumber}`, ip || null]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

exports.authorize = async ({ entityId, superAdminUserId, notes, ip }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const configRes = await client.query(
      `SELECT * FROM entity_masav_details WHERE entity_id = $1 FOR UPDATE`,
      [entityId]
    );
    const config = configRes.rows[0];
    if (!config) {
      const err = new Error('Entity has no MASAV bank details configured yet');
      err.code = 'MASAV_NOT_CONFIGURED';
      throw err;
    }
    if (!config.bank_code || !config.branch_code || !config.account_number) {
      const err = new Error('MASAV bank details are incomplete');
      err.code = 'MASAV_INCOMPLETE';
      throw err;
    }

    const { rows } = await client.query(
      `UPDATE entity_masav_details
       SET authorized = true, authorized_by = $2, authorized_at = NOW(), updated_at = NOW()
       WHERE entity_id = $1
       RETURNING *`,
      [entityId, superAdminUserId]
    );

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, 'masav_authorize', $3, $4)`,
      [superAdminUserId, entityId, notes || null, ip || null]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

exports.revoke = async ({ entityId, superAdminUserId, notes, ip }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const configRes = await client.query(`SELECT id FROM entity_masav_details WHERE entity_id = $1 FOR UPDATE`, [entityId]);
    if (!configRes.rows[0]) {
      const err = new Error('Entity has no MASAV bank details configured');
      err.code = 'MASAV_NOT_CONFIGURED';
      throw err;
    }

    const { rows } = await client.query(
      `UPDATE entity_masav_details
       SET authorized = false, authorized_by = NULL, authorized_at = NULL, updated_at = NOW()
       WHERE entity_id = $1
       RETURNING *`,
      [entityId]
    );

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, 'masav_revoke', $3, $4)`,
      [superAdminUserId, entityId, notes || null, ip || null]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
