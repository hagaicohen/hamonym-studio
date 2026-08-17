const express     = require('express');
const router      = express.Router();
const controller  = require('./recurring.controller');
const requireAuth = require('../../middleware/require-auth');

// Donor-facing (Personal Area) — every route here requires the donor's own
// auth and is scoped to their own instructions, never by instructionId
// alone (see verifyOwnership in the controller).
router.get('/my',            requireAuth, controller.getMyRecurring);
router.get('/:id/history',   requireAuth, controller.getHistory);
router.post('/:id/pause',    requireAuth, controller.pause);
router.post('/:id/resume',   requireAuth, controller.resume);
router.post('/:id/cancel',   requireAuth, controller.cancel);

module.exports = router;
