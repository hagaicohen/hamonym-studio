// Collection Ops -- own sub-router (same pattern as billing-ops/finance-ops),
// mounted under /platform/collection-ops by platform.routes.js. Read-only
// aggregation endpoints for the unified "ניהול גבייה" page; every write
// action stays on billing-ops/finance-ops's existing routes.
const express = require('express');
const router = express.Router();
const ctrl = require('./collection-ops.controller');
const requireSuperAdmin = require('../../../middleware/require-super-admin');

router.use(requireSuperAdmin);

router.get('/overview', ctrl.getFinancialOverview);
router.get('/needs-attention', ctrl.getNeedsAttention);
router.get('/system-activity', ctrl.getSystemActivity);
router.get('/history', ctrl.searchStatementHistory);
router.get('/report/preview', ctrl.getFinancialReportPreview);
router.get('/report', ctrl.exportFinancialReport);

module.exports = router;
