const express = require('express');
const router = express.Router();
const controller = require('./comments.controller');

// Public — anonymous, no auth required
router.get('/campaign/:slug', controller.getComments);
router.post('/campaign/:slug', controller.createComment);

module.exports = router;
