const express     = require('express');
const router      = express.Router();
const ctrl        = require('./reports.controller');
const requireAuth = require('../../middleware/require-auth');
const { requireEntityOwnership } = require('../../middleware/entity-permission.middleware');

router.get('/entity/:id/campaigns', requireAuth, requireEntityOwnership(), ctrl.getCampaignPerformance);
router.get('/entity/:id/marketing', requireAuth, requireEntityOwnership(), ctrl.getMarketingSources);
router.get('/entity/:id/trends',    requireAuth, requireEntityOwnership(), ctrl.getTrends);
router.get('/entity/:id/failures',  requireAuth, requireEntityOwnership(), ctrl.getFailures);

module.exports = router;
