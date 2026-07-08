const express = require('express');
const router = express.Router();
const ctrl = require('./platform.controller');
const requireAuth = require('../../middleware/require-auth');
const requireSuperAdmin = require('../../middleware/require-super-admin');

router.use(requireAuth, requireSuperAdmin);

router.get('/dashboard', ctrl.getDashboard);
router.get('/organizations', ctrl.getOrganizations);
router.get('/organizations/:id', ctrl.getOrganization);
router.post('/organizations/:id/approve', ctrl.approve);
router.post('/organizations/:id/reject', ctrl.reject);
router.post('/organizations/:id/request-changes', ctrl.requestChanges);
router.post('/organizations/:id/suspend', ctrl.suspend);
router.post('/organizations/:id/reactivate', ctrl.reactivate);

module.exports = router;
