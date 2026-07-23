// Immutable log of every Brief generation — see migrations/031 and
// AI_CREATIVE_DIRECTOR_CONCEPT.md's "Brief as an artifact" follow-up
// (2026-07-23). Written once per generation; the only field ever updated
// afterward is campaign_id (linkCampaign), and that's a link, not a
// content mutation — brief_json/model/prompt_version never change once
// written. A logging failure here must never break the actual campaign-
// creation request, so callers should treat this as best-effort (the
// controller doesn't await-and-throw, or wraps in try/catch).

const db = require('../../db/db');

// @param {{ userId: number|null, promptVersion: string, model: string, brief: object, webSearchUsed: boolean, webSources: Array, generationTimeMs: number, generationReason: 'initial'|'regenerated'|'refined' }} params
// @returns {Promise<string|null>} the new row's id, or null if logging failed (never throws)
exports.logGeneration = async ({ userId, promptVersion, model, brief, webSearchUsed, webSources, generationTimeMs, generationReason }) => {
  try {
    const result = await db.query(
      `INSERT INTO campaign_ai_generations
        (created_by_user_id, prompt_version, model, brief_json, web_search_used, web_sources, generation_time_ms, generation_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [userId || null, promptVersion, model, JSON.stringify(brief), !!webSearchUsed, JSON.stringify(webSources || []), generationTimeMs || null, generationReason],
    );
    return result.rows[0].id;
  } catch (err) {
    console.error('logGeneration failed (non-fatal):', err.message);
    return null;
  }
};

// @param {string} generationId
// @param {string} campaignId
// @returns {Promise<void>} never throws — linking is best-effort, same as logGeneration
exports.linkCampaign = async (generationId, campaignId) => {
  try {
    await db.query(`UPDATE campaign_ai_generations SET campaign_id = $1 WHERE id = $2`, [campaignId, generationId]);
  } catch (err) {
    console.error('linkCampaign failed (non-fatal):', err.message);
  }
};
