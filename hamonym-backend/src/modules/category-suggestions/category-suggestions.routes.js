// Authenticated users suggest a category (mounted at /api/category-suggestions).
// The Super Admin review routes live in platform.routes.js.
const express = require('express');
const requireAuth = require('../../middleware/require-auth');
const controller = require('./category-suggestions.controller');

const router = express.Router();

router.post('/', requireAuth, express.json({ limit: '2kb' }), controller.create);

module.exports = router;
