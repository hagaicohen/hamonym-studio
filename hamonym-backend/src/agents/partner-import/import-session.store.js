// Per-import-attempt state (partner_import_sessions, migration 037) —
// deliberately separate from extraction.cache.js: the same cached
// extraction can back many unrelated import sessions (different
// campaigns/managers importing the same business site). A session just
// points at a cache row, never duplicates its content. sessionId (this
// row's id) is opaque and random — never derived from the URL, so it
// can't be guessed/reused across unrelated imports.

const db = require('../../db/db');

// @param {string} extractionCacheId
// @returns {Promise<string>} the new session's id
exports.create = async (extractionCacheId) => {
  const { rows } = await db.query(
    `INSERT INTO partner_import_sessions (extraction_cache_id) VALUES ($1) RETURNING id`,
    [extractionCacheId],
  );
  return rows[0].id;
};

// @param {string} sessionId
// @returns {Promise<{ extractionCacheId: string } | null>}
exports.get = async (sessionId) => {
  const { rows } = await db.query(
    `SELECT extraction_cache_id FROM partner_import_sessions WHERE id = $1`,
    [sessionId],
  );
  if (!rows.length) return null;
  return { extractionCacheId: rows[0].extraction_cache_id };
};
