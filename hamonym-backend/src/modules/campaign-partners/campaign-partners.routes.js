const express = require('express');
const router = express.Router();
const controller = require('./campaign-partners.controller');
const requireAuth = require('../../middleware/require-auth');

// Public — anonymous, no auth required (campaign public page / Partner Navigation, Phase 4)
router.get('/public/:slug', controller.listPublicForCampaign);

// Authenticated — ownership resolved inside the service via the campaign's
// owning entity (campaign manager), not the partner. See
// docs/PARTNER_DOMAIN_MODEL_ADR.md §4 ownership split.
router.get('/campaign/:campaignId', requireAuth, controller.listForCampaign);
router.post('/campaign/:campaignId', requireAuth, controller.create);
router.patch('/:id', requireAuth, controller.update);
router.delete('/:id', requireAuth, controller.remove);

module.exports = router;
