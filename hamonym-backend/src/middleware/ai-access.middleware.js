const db = require('../db/db');
const { isEntityMember } = require('./entity-permission.middleware');

// AI Visibility Gate — every AI-labeled capability is hidden/greyed out on
// the frontend for clients by default; only a Platform Admin can grant it,
// per entity (see entities.ai_features_enabled, migration 041). This
// middleware is the server-side half — the frontend gate is UX, not
// security, so a direct API call must be blocked the same way.
//
// Mount AFTER requireAuth. requireAiAccessForCampaign has no ownership gap
// (the entity is resolved from the campaign row, never trusted from the
// request); requireAiAccessFromBody below also checks entity membership
// directly, since its entityId is read from the client-supplied body.
async function hasAiAccess(entityId) {
  if (!entityId) return false;
  const { rows } = await db.query(
    `SELECT ai_features_enabled FROM entities WHERE id = $1`,
    [entityId]
  );
  return !!rows[0]?.ai_features_enabled;
}
exports.hasAiAccess = hasAiAccess;

const DENIED = { error: 'AI features are not enabled for this account' };

// For routes scoped by an existing campaign (e.g. POST /campaigns/:id/advise)
// — resolves the campaign's owning entity, then checks its flag.
exports.requireAiAccessForCampaign = (paramName = 'id') => async (req, res, next) => {
  try {
    const campaignId = req.params[paramName];
    const { rows } = await db.query(`SELECT entity_id FROM campaigns WHERE id = $1`, [campaignId]);
    if (!rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    if (!(await hasAiAccess(rows[0].entity_id))) return res.status(403).json(DENIED);
    next();
  } catch (err) {
    console.error('[requireAiAccessForCampaign] error:', err.message);
    res.status(500).json({ error: 'AI access check failed' });
  }
};

// For entity-agnostic AI processing routes (campaign-creation brief
// extraction, partner AI website import) — these don't carry a campaignId
// yet (the campaign/partner doesn't exist until later), so the frontend
// sends entityId directly in the request body instead.
//
// One deliberate exception: /partners/create/ai must keep working for a
// brand-new user with NO entities yet (see app.routes.ts's comment on that
// route) — there's nothing to gate against yet, so a missing entityId is
// only allowed through when the acting user genuinely has zero entities.
// If they DO have entities but omitted entityId anyway, that's either a
// bug or a bypass attempt — denied either way.
exports.requireAiAccessFromBody = (field = 'entityId') => async (req, res, next) => {
  try {
    const entityId = req.body?.[field];
    if (entityId) {
      // 2026-09-10 fix: entityId comes straight from the request body --
      // without this, any authenticated user could supply a DIFFERENT
      // entity's id here and run (cost-incurring) AI calls under that
      // entity's granted access, regardless of their own membership.
      if (!(await isEntityMember(req.user?.id, entityId))) return res.status(403).json({ error: 'Unauthorized' });
      if (!(await hasAiAccess(entityId))) return res.status(403).json(DENIED);
      return next();
    }

    const { rows } = await db.query(`SELECT 1 FROM user_entities WHERE user_id = $1 LIMIT 1`, [req.user?.id]);
    if (rows.length === 0) return next(); // genuine first-time onboarding — nothing to gate yet
    return res.status(400).json({ error: `Missing ${field}` });
  } catch (err) {
    console.error('[requireAiAccessFromBody] error:', err.message);
    res.status(500).json({ error: 'AI access check failed' });
  }
};
