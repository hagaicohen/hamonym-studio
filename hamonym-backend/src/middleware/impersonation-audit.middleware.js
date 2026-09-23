const db = require('../db/db');

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Only campaign ids appear reliably in route params across the endpoints an
// impersonated session can reach (:id on /api/campaigns/:id and most of its
// sub-routes) -- entity_id is deliberately left null rather than doing an
// extra lookup per request just for this log; the campaign id alone is
// enough to trace the action back to a specific campaign/entity by hand.
const CAMPAIGN_ID_RE = /\/campaigns\/([0-9a-f-]{36})/i;

// Records who was really at the keyboard for every mutation made while a
// super admin is impersonating another user (2026-09-23, pre-pilot audit
// gap). req.user.impersonatedBy is already decoded onto every request during
// an impersonation session (require-auth.js) but nothing previously read it
// -- an impersonated campaign edit, visibility toggle, etc. was persisted
// with zero trace that it wasn't the real user acting on their own. This
// does NOT change what the action is allowed to do (still runs with the
// impersonated user's own permissions/scope) -- it only adds a parallel,
// append-only record of "admin X was impersonating user Y when this
// happened." Deliberately reuses platform_audit_log instead of a new table.
//
// Registered globally, before requireAuth runs for whichever router
// eventually handles the request -- req.user isn't set yet when this
// middleware itself runs, but the res.on('finish') callback only fires
// after the route handler (and therefore requireAuth) has completed, by
// which point req.user is populated.
module.exports = function impersonationAudit(req, res, next) {
  res.on('finish', () => {
    const impersonatedBy = req.user?.impersonatedBy;
    if (!impersonatedBy) return;
    if (!MUTATING_METHODS.has(req.method)) return;

    const match = req.path.match(CAMPAIGN_ID_RE);
    const campaignId = match ? match[1] : null;

    db.query(
      `INSERT INTO platform_audit_log
         (super_admin_user_id, target_user_id, campaign_id, action, notes, ip_address)
       VALUES ($1, $2, $3, 'impersonated_action', $4, $5)`,
      [
        impersonatedBy,
        req.user.id,
        campaignId,
        `${req.method} ${req.path} -> ${res.statusCode}`,
        req.ip || null,
      ],
    ).catch(err => console.error('impersonation audit log failed:', err.message));
  });

  next();
};
