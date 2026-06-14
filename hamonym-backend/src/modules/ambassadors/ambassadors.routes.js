const express     = require('express');
const router      = express.Router();
const ctrl        = require('./ambassadors.controller');
const requireAuth = require('../../middleware/require-auth');

// Public — all ambassadors with stats for leaderboard
router.get(
  '/campaigns/:campaignSlug/ambassadors/public',
  ctrl.listPublic
);

// Public — single ambassador by slug
router.get(
  '/campaigns/:campaignSlug/ambassadors/by-slug/:ambassadorSlug',
  ctrl.getBySlug
);

// Public — self-register as ambassador (no auth required)
router.post(
  '/campaigns/:campaignSlug/ambassadors/self-register',
  ctrl.selfRegister
);

// Protected — campaign builder management
router.get(
  '/campaigns/:campaignId/ambassadors',
  requireAuth,
  ctrl.list
);

router.post(
  '/campaigns/:campaignId/ambassadors',
  requireAuth,
  ctrl.create
);

router.post(
  '/campaigns/:campaignId/ambassadors/import',
  requireAuth,
  ctrl.importBulk
);

router.patch(
  '/ambassadors/:id',
  requireAuth,
  ctrl.update
);

router.delete(
  '/ambassadors/:id',
  requireAuth,
  ctrl.remove
);

router.post(
  '/ambassadors/:id/adjustments',
  requireAuth,
  ctrl.addAdjustment
);

module.exports = router;
