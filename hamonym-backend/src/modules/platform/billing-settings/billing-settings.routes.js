// Platform-level billing settings (currently: the one system-wide VAT
// rate) — own tiny sub-router, same pattern as billing-provisioning.
// requireSuperAdmin, not requirePermission('organizations') -- changing
// Hamonym's VAT rate is a commercial decision, held to the same bar as
// setting fee_rate/vat_rate at account-creation time.
const express = require('express');
const router = express.Router();
const ctrl = require('./billing-settings.controller');
const requireSuperAdmin = require('../../../middleware/require-super-admin');

router.use(requireSuperAdmin);

router.get('/', ctrl.get);
router.put('/', ctrl.update);

module.exports = router;
