// Finance Operations -- own sub-router (same pattern as billing-ops),
// mounted under /platform/finance-ops by platform.routes.js. requireSuperAdmin
// throughout -- overriding a collection hold, resolving an overpayment
// exception, and approving/exporting a MASAV proposal are all financial
// Super Admin decisions, held to the same bar as billing-ops itself.
const express = require('express');
const router = express.Router();
const ctrl = require('./finance-ops.controller');
const requireSuperAdmin = require('../../../middleware/require-super-admin');

router.use(requireSuperAdmin);

router.get('/exceptions', ctrl.listExceptions);
router.get('/exceptions/:id/actions', ctrl.getExceptionActions);
router.post('/exceptions/:id/override-hold', ctrl.overrideExceptionHold);
router.post('/exceptions/:id/resolve', ctrl.resolveException);

router.get('/masav-proposals', ctrl.listMasavProposals);
router.post('/masav-proposals/:id/approve', ctrl.approveMasavProposal);
router.post('/masav-proposals/export', ctrl.exportMasavProposals);
router.post('/masav-proposals/export-preview',ctrl.previewMasavExport);

router.get('/statements/:id/balance', ctrl.getStatementBalance);

router.post('/masav-instructions/:id/confirmed-result', ctrl.recordMasavResult);
router.get('/masav-instructions', ctrl.listMasavInstructions);
router.post('/masav-instructions/:id/finalize', ctrl.finalizeMasavInstruction);
router.post('/masav-instructions/:id/retry', ctrl.prepareMasavRetry);
module.exports = router;
