const express = require('express');
const router = express.Router();
const controller = require('./partner-import.controller');
const requireAuth = require('../../middleware/require-auth');

router.post('/extract', requireAuth, controller.extract);
router.post('/classify', requireAuth, controller.classify);
router.post('/apply', requireAuth, controller.apply);
router.post('/clone', requireAuth, controller.clone);

module.exports = router;
