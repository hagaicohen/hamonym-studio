const express     = require('express');
const router      = express.Router();
const ctrl        = require('./reports.controller');
const requireAuth = require('../../middleware/require-auth');

router.get('/entity/:id/campaigns', requireAuth, ctrl.getCampaignPerformance);
router.get('/entity/:id/marketing', requireAuth, ctrl.getMarketingSources);
router.get('/entity/:id/trends',    requireAuth, ctrl.getTrends);
router.get('/entity/:id/failures',  requireAuth, ctrl.getFailures);

module.exports = router;
