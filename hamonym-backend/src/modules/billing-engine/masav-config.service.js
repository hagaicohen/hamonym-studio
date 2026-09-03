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

// Columns returned to callers -- deliberately excludes authorization_
// document_data (bytea, can be multi-MB). Same rationale as entities.
// service.js's BLOB_COLUMNS/stripBlobs: every ordinary config read (the
// MASAV tab opening, blocked/actionable statement lists) only needs to know
// *whether* a document was uploaded and its name, never the bytes -- those
// are fetched separately by the dedicated download route below.
const CONFIG_COLUMNS = `
  id, entity_id, bank_code, branch_code, account_number, account_holder_name,
  authorized, authorized_by, authorized_at,
  authorization_document_name, authorization_document_mime,
  authorization_document_uploaded_at, authorization_document_uploaded_by,
  (authorization_document_data IS NOT NULL) AS has_authorization_document,
  created_at, updated_at
`;

exports.getByEntityId = async (entityId) => {
  const { rows } = await pool.query(
    `SELECT ${CONFIG_COLUMNS} FROM entity_masav_details WHERE entity_id = $1`,
    [entityId]
  );
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
       RETURNING ${CONFIG_COLUMNS}`,
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
      `SELECT bank_code, branch_code, account_number FROM entity_masav_details WHERE entity_id = $1 FOR UPDATE`,
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
       RETURNING ${CONFIG_COLUMNS}`,
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
       RETURNING ${CONFIG_COLUMNS}`,
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

// multer/busboy decode multipart filenames as latin1 even when the browser
// sent UTF-8 bytes (e.g. Hebrew filenames) -- same fix as entities.service.
// js#fixFilenameEncoding, duplicated locally rather than cross-importing
// between the entities and billing-engine modules for one helper.
function fixFilenameEncoding(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
}

// The signed bank-authorization scan/PDF the association uploads during
// MASAV setup -- evidence a Super Admin can review before deciding whether
// to authorize(), never itself an authorization event. Deliberately never
// touches authorized/authorized_by/authorized_at (see migration 060/063
// header comments and authorize()/revoke() above, which remain the only
// writers of that boolean).
//
// Requires bank details to already be configured (entity_masav_details row
// must exist -- created by upsertBankDetails) -- matches the setup screen's
// own order: bank fields first, then the signed document upload.
exports.uploadAuthorizationDocument = async ({ entityId, file, superAdminUserId, ip }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const configRes = await client.query(
      `SELECT id FROM entity_masav_details WHERE entity_id = $1 FOR UPDATE`,
      [entityId]
    );
    if (!configRes.rows[0]) {
      const err = new Error('Entity has no MASAV bank details configured yet -- save bank details before uploading the authorization document');
      err.code = 'MASAV_NOT_CONFIGURED';
      throw err;
    }

    const { rows } = await client.query(
      `UPDATE entity_masav_details
       SET authorization_document_name = $2,
           authorization_document_mime = $3,
           authorization_document_data = $4,
           authorization_document_uploaded_at = NOW(),
           authorization_document_uploaded_by = $5,
           updated_at = NOW()
       WHERE entity_id = $1
       RETURNING ${CONFIG_COLUMNS}`,
      [entityId, fixFilenameEncoding(file.originalname), file.mimetype, file.buffer, superAdminUserId]
    );

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, 'masav_authorization_document_upload', $3, $4)`,
      [superAdminUserId, entityId, file.originalname, ip || null]
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

// Full bytes, for the authenticated (requireSuperAdmin) download route only
// -- never for the ordinary config read above (getByEntityId/CONFIG_COLUMNS
// deliberately excludes authorization_document_data).
exports.getAuthorizationDocumentFile = async (entityId) => {
  const { rows } = await pool.query(
    `SELECT authorization_document_name, authorization_document_mime, authorization_document_data
     FROM entity_masav_details WHERE entity_id = $1`,
    [entityId]
  );
  const row = rows[0];
  if (!row || !row.authorization_document_data) return null;
  return {
    name: row.authorization_document_name,
    mime: row.authorization_document_mime,
    data: row.authorization_document_data,
  };
};
