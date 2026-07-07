const express     = require('express');
const router      = express.Router();
const controller  = require('./donations.controller');
const requireAuth = require('../../middleware/require-auth');

// Public — donors are not logged in
router.post('/',                          controller.createDonation);
router.post('/mock-complete',             controller.mockComplete);
router.get('/return',                     controller.handleReturn);
router.get('/public/:id',                 controller.getDonationPublic);
router.get('/campaign/:slug/donors',      controller.getCampaignDonors);
router.get('/campaign/:slug/live',        controller.getLiveDonations);

// Authenticated — entity manager
router.get('/entity/:id',          requireAuth,  controller.getEntityDonations);
router.get('/entity/:id/donors',   requireAuth,  controller.getEntityDonors);

module.exports = router;
