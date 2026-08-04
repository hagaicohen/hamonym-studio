// Idempotency for POST /apply — a replayed create-and-link request (double
// click, retry after a network blip) returns the original result instead
// of creating a duplicate entities/campaign_partners row. Backed by
// partner_import_idempotency_keys (migration 037).

const db = require('../../db/db');

// @param {string} key
// @returns {Promise<object|null>} the previously-stored result, or null if this key is new
exports.getResult = async (key) => {
  if (!key) return null;
  const { rows } = await db.query(
    `SELECT result FROM partner_import_idempotency_keys WHERE idempotency_key = $1`,
    [key],
  );
  return rows.length ? rows[0].result : null;
};

// @param {string} key
// @param {object} result
// @returns {Promise<void>}
exports.saveResult = async (key, result) => {
  if (!key) return;
  await db.query(
    `INSERT INTO partner_import_idempotency_keys (idempotency_key, result)
     VALUES ($1, $2)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [key, JSON.stringify(result)],
  );
};
