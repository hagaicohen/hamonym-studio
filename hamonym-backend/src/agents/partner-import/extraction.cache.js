// Pure content cache for lossless-dom.extractor.js's output — DB-backed
// (partner_import_extraction_cache, migration 037), same "TTL enforced in
// application code, not a cron" convention as
// campaign-creation/tools/organization-research.tool.js's own cache table.
// Deliberately NOT in-memory: nodemon restarts the whole backend process on
// every file save during dev (see src/db/db.js's own comment on this),
// which would silently wipe an in-memory cache constantly.
//
// Knows nothing about campaigns or in-progress imports — see
// import-session.store.js for the separate, per-attempt state that points
// at a cache row here. See partner-import.types.js's INVARIANTS.

const db = require('../../db/db');
const { EXTRACTOR_VERSION } = require('./partner-import.types');

const CACHE_TTL_HOURS = 24;

// @param {string} url
// @returns {Promise<{ id: string, blocks: object[], pageTitle: string, foundSignals: object } | null>}
exports.getFresh = async (url) => {
  try {
    const { rows } = await db.query(
      `SELECT id, blocks, page_title, found_signals FROM partner_import_extraction_cache
       WHERE url = $1 AND extractor_version = $2
         AND created_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [url, EXTRACTOR_VERSION],
    );
    if (!rows.length) return null;
    return { id: rows[0].id, blocks: rows[0].blocks, pageTitle: rows[0].page_title, foundSignals: rows[0].found_signals };
  } catch {
    return null; // a failed cache lookup shouldn't block a fresh extraction
  }
};

// @param {{ url: string, blocks: object[], pageTitle: string, foundSignals: object }} params
// @returns {Promise<string>} the new cache row's id
exports.save = async ({ url, blocks, pageTitle, foundSignals }) => {
  const { rows } = await db.query(
    `INSERT INTO partner_import_extraction_cache (url, page_title, blocks, found_signals, extractor_version)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [url, pageTitle || null, JSON.stringify(blocks), JSON.stringify(foundSignals || {}), EXTRACTOR_VERSION],
  );
  return rows[0].id;
};

// @param {string} cacheId
// @returns {Promise<{ blocks: object[], pageTitle: string, foundSignals: object } | null>}
exports.getById = async (cacheId) => {
  const { rows } = await db.query(
    `SELECT blocks, page_title, found_signals FROM partner_import_extraction_cache WHERE id = $1`,
    [cacheId],
  );
  if (!rows.length) return null;
  return { blocks: rows[0].blocks, pageTitle: rows[0].page_title, foundSignals: rows[0].found_signals };
};
