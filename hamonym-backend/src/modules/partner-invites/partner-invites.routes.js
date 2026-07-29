const express = require('express');
const router = express.Router();
const controller = require('./partner-invites.controller');
const requireAuth = require('../../middleware/require-auth');

// Public — anyone with the (unguessable, hashed) token can see who/what
// they're being invited to, before they've logged in.
router.get('/:token', controller.getInvite);

// Authenticated — the accepting user's identity determines whether the
// invite's email matches (see partner-invites.service.js#acceptInvite).
router.post('/:token/accept', requireAuth, controller.acceptInvite);

module.exports = router;
