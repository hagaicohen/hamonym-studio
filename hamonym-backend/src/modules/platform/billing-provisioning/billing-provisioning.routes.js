// Billing Account Provisioning — own sub-router (same pattern as
// cardcom-ops), mounted under /platform/billing-accounts by
// platform.routes.js. requireSuperAdmin, not requirePermission('organizations')
// -- setting Hamonym's own fee_rate/vat_rate is a commercial decision, held
// to the same "full super admin only" bar as user/role management, not the
// more broadly-scoped admin permission that already covers approving/
// suspending entities.
const express = require('express');
const router = express.Router();
const ctrl = require('./billing-provisioning.controller');
const requireSuperAdmin = require('../../../middleware/require-super-admin');

router.use(requireSuperAdmin);

router.get('/unprovisioned', ctrl.listUnprovisioned);
router.get('/:entityId', ctrl.getByEntityId);
router.post('/', ctrl.create);

module.exports = router;
