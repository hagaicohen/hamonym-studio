const express     = require('express');
const router      = express.Router();
const controller  = require('./recurring.controller');
const requireAuth = require('../../middleware/require-auth');

// Donor-facing (Personal Area) — every route here requires the donor's own
// auth and is scoped to their own instructions, never by instructionId
// alone. Pause/Resume/Cancel routes are a separate, later phase.
router.get('/my',            requireAuth, controller.getMyRecurring);
router.get('/:id/history',   requireAuth, controller.getHistory);

module.exports = router;
