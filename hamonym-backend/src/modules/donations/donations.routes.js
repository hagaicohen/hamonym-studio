const express    = require('express');
const router     = express.Router();
const controller = require('./donations.controller');

// Public — donors are not logged in
router.post('/',                          controller.createDonation);
router.post('/mock-complete',             controller.mockComplete);
router.get('/return',                     controller.handleReturn);
router.get('/public/:id',                 controller.getDonationPublic);
router.get('/campaign/:slug/donors',      controller.getCampaignDonors);
router.get('/campaign/:slug/live',        controller.getLiveDonations);

module.exports = router;
