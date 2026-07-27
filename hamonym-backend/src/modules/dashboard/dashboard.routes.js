const express    = require('express');
const router     = express.Router();
const requireAuth = require('../../middleware/require-auth');
const { requireEntityOwnership } = require('../../middleware/entity-permission.middleware');
const controller  = require('./dashboard.controller');

router.get('/:id/dashboard',    requireAuth, requireEntityOwnership(), controller.getDashboard);
router.get('/:id/alert-count',  requireAuth, requireEntityOwnership(), controller.getAlertCount);

module.exports = router;
