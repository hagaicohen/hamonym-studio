// Super Admin "כלי סימולציה" -- own tiny sub-router, same pattern as
// billing-settings. requireSuperAdmin only: GET is read-only/always-safe,
// every write is independently gated inside clock.js itself regardless of
// who can reach this route.
const express = require('express');
const router = express.Router();
const ctrl = require('./simulation-clock.controller');
const requireSuperAdmin = require('../../../middleware/require-super-admin');

router.use(requireSuperAdmin);

router.get('/', ctrl.getStatus);
router.post('/set-fixed', ctrl.setFixed);
router.post('/set-offset', ctrl.setOffset);
router.post('/reset', ctrl.reset);

module.exports = router;
