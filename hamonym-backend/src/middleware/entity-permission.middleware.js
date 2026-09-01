const db = require('../db/db');

// Single source of truth for "does this authenticated user manage this
// entity?" — consolidates what used to be three separately-written copies of
// the same query (entities.service.js#checkOwnership,
// campaigns.service.js#validateOwnership,
// ambassadors.service.js#verifyEntityOwnership), and closes a gap where
// several other entity-scoped routes (donations/dashboard/reports/
// registrations/billing, and part of entities.routes.js) had requireAuth
// (valid JWT) but no check that the JWT's user actually belongs to the
// :id in the URL — any authenticated user could read/act on ANY entity.
// See docs/DECISIONS.md (2026-07-15) — entity-ownership audit.
//
// Not used by src/modules/platform/* — Super Admin routes are a separate
// route tree gated by requirePlatformAccess/requireSuperAdmin instead, and
// are intentionally NOT scoped to user_entities membership (an admin must
// be able to act on any entity). Impersonation is safe here by construction:
// the impersonation JWT carries the impersonated user's real id, so this
// check behaves exactly as it would for that user acting directly.
async function isEntityMember(userId, entityId) {
  if (!userId || !entityId) return false;
  const { rows } = await db.query(
    `SELECT 1 FROM user_entities WHERE user_id = $1 AND entity_id = $2 LIMIT 1`,
    [userId, entityId]
  );
  return rows.length > 0;
}
exports.isEntityMember = isEntityMember;

// Shared shape behind every ownership-check middleware below: pull an
// entityId out of the request some way, then 403 unless req.user belongs to
// it. getEntityId may be async (needed when the entity isn't known until a
// DB row is resolved, e.g. a billing record's :id doesn't reveal its owning
// entity by itself).
function requireEntityOwnershipFrom(getEntityId, missingMessage) {
  return async (req, res, next) => {
    try {
      const entityId = await getEntityId(req);
      if (!entityId) return res.status(400).json({ error: missingMessage });
      const ok = await isEntityMember(req.user?.id, entityId);
      if (!ok) return res.status(403).json({ error: 'Unauthorized' });
      next();
    } catch (err) {
      console.error('[requireEntityOwnership] error:', err.message);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

// Express middleware — mount AFTER requireAuth. 403s unless req.user is a
// member of the entity identified by req.params[paramName].
exports.requireEntityOwnership = (paramName = 'id') =>
  requireEntityOwnershipFrom((req) => req.params[paramName], `Missing :${paramName} param`);

// Same check, for routes where the entity being acted on comes from the
// request body instead of the URL (e.g. a create endpoint that doesn't yet
// have a record id to put in the path).
exports.requireBodyEntityOwnership = (fieldName = 'entityId') =>
  requireEntityOwnershipFrom((req) => req.body?.[fieldName], `Missing ${fieldName} in body`);
