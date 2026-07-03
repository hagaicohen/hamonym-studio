const express    = require('express');
const router     = express.Router();
const requireAuth = require('../../middleware/require-auth');
const controller  = require('./dashboard.controller');

router.get('/:id/dashboard',     requireAuth, controller.getDashboard);
router.get('/:id/alert-count',  requireAuth, controller.getAlertCount);

module.exports = router;
