// Billing Operations -- own sub-router (same pattern as billing-provisioning
// and cardcom-ops), mounted under /platform/billing-ops by platform.routes.js.
// requireSuperAdmin throughout: triggering calculation/approval/collection
// and configuring MASAV banking details are all financial/commercial
// operator actions, held to the same bar as billing account provisioning.
const express = require('express');
const router = express.Router();
const ctrl = require('./billing-ops.controller');
const masavCtrl = require('./masav-ops.controller');
const requireSuperAdmin = require('../../../middleware/require-super-admin');

router.use(requireSuperAdmin);

router.get('/periods', ctrl.listPeriods);
router.post('/periods', ctrl.createPeriod);
router.post('/periods/:periodId/calculate', ctrl.calculatePeriod);

router.get('/runs', ctrl.listRuns);

router.get('/statements', ctrl.listStatements);
router.get('/statements/:id', ctrl.getStatement);
router.post('/statements/:id/approve', ctrl.approveStatement);
router.post('/statements/bulk-approve', ctrl.bulkApproveStatements);
router.post('/statements/:id/abandon', ctrl.abandonStatement);
router.post('/statements/:id/collect', ctrl.triggerCollection);

// MASAV (Bundle 2, corrected 2026-09-01) -- structured bank config,
// explicit authorization, and the Excel export flow. v1 stops at export:
// there is deliberately no route to manually record a MASAV result -- see
// masav-ops.controller.js and masav-collection.service.js header comments.
router.get('/masav/blocked-statements', masavCtrl.listBlocked);
router.get('/masav/actionable-statements', masavCtrl.listActionable);
router.get('/masav/export', masavCtrl.exportExcel);
router.get('/masav/:entityId', masavCtrl.getConfig);
router.put('/masav/:entityId', masavCtrl.upsertConfig);
router.post('/masav/:entityId/authorize', masavCtrl.authorize);
router.post('/masav/:entityId/revoke', masavCtrl.revoke);
router.post('/masav/statements/:id/open-attempt', masavCtrl.openAttempt);

module.exports = router;
