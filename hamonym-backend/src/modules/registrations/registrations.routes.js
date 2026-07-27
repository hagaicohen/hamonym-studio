const express     = require('express');
const router      = express.Router();
const controller  = require('./registrations.controller');
const requireAuth = require('../../middleware/require-auth');
const { requireEntityOwnership } = require('../../middleware/entity-permission.middleware');

// Authenticated + entity-owned. (Correction of an earlier comment here: the
// codebase does have a correct ownership-check precedent — entities/campaigns/
// ambassadors all had it already; donations/dashboard/reports/registrations
// were the actual gap. See docs/DECISIONS.md, 2026-07-15 entity-ownership audit.)
router.get('/entity/:id', requireAuth, requireEntityOwnership(), controller.getEntityRegistrations);

module.exports = router;
