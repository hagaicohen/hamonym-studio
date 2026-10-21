// Super Admin "סימולציה" tab, tool B -- own tiny sub-router, same
// requireSuperAdmin convention as every other financial-adjacent platform
// route (billing-settings, finance-ops).
const express = require('express');
const router = express.Router();
const ctrl = require('./campaign-reset.controller');
const requireSuperAdmin = require('../../../middleware/require-super-admin');

router.use(requireSuperAdmin);

router.get('/:id/preview', ctrl.getPreview);
router.post('/:id/reset', ctrl.reset);

module.exports = router;
