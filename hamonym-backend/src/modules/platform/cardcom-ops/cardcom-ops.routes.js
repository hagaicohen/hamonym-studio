const express = require('express');
const router = express.Router();
const ctrl = require('./cardcom-ops.controller');
const requireSuperAdmin = require('../../../middleware/require-super-admin');

// Full super admin only, like /platform/users — a brand-new,
// payments-adjacent capability doesn't get a scoped permission until
// there's an actual product decision to grant it more narrowly (see
// docs/CARDCOM_OPERATIONAL_PROCESSES.md Part G/H).
router.use(requireSuperAdmin);

// Temporary diagnostic (2026-08-30) -- see the controller's own comment.
// Read-only against CardCom, no charge, no DB write. Remove once the 603
// credential question is settled and this has served its purpose.
router.get('/diagnostics/hamonym-terminal-auth', ctrl.diagnoseHamonymTerminalAuth);

router.get('/health', ctrl.getHealth);
router.get('/jobs/runs', ctrl.getJobRuns);
router.post('/jobs/:name/run', ctrl.runJob);
router.get('/findings', ctrl.getFindings);
router.post('/findings/:id/resolve', ctrl.resolveFinding);

module.exports = router;
