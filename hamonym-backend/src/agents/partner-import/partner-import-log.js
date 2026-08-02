// Quality metrics for AI Website Import — same fire-and-forget,
// never-throws convention as campaign-creation/generation-log.js. Logged
// once per POST /apply (not per /classify), since tier outcomes are only
// final once the manager has actually reviewed the review screen.

const db = require('../../db/db');

// @param {{ sessionId: string, extractTimeMs: number, classificationTimeMs: number, blocksFound: number, acceptedAutomatically: number, acceptedAfterReview: number, discarded: number }} params
// @returns {Promise<void>} never throws
exports.logImport = async ({ sessionId, extractTimeMs, classificationTimeMs, blocksFound, acceptedAutomatically, acceptedAfterReview, discarded }) => {
  try {
    await db.query(
      `INSERT INTO partner_import_metrics
        (session_id, extract_time_ms, classification_time_ms, blocks_found, accepted_automatically, accepted_after_review, discarded)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId || null, extractTimeMs || null, classificationTimeMs || null, blocksFound || 0, acceptedAutomatically || 0, acceptedAfterReview || 0, discarded || 0],
    );
  } catch (err) {
    console.error('logImport failed (non-fatal):', err.message);
  }
};
