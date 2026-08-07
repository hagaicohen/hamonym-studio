const express = require('express');
const router = express.Router();
const controller = require('./partner-import.controller');
const requireAuth = require('../../middleware/require-auth');
const { requireAiAccessFromBody } = require('../../middleware/ai-access.middleware');

router.post('/extract',  requireAuth, requireAiAccessFromBody(), controller.extract);
router.post('/classify', requireAuth, requireAiAccessFromBody(), controller.classify);
router.post('/apply',    requireAuth, requireAiAccessFromBody(), controller.apply);
// /clone is deterministic (no LLM, no classification — see
// partner-import.controller.js#clone) — not an AI capability, not gated.
router.post('/clone',    requireAuth, controller.clone);

module.exports = router;
