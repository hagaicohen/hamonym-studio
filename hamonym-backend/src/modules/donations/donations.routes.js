const express     = require('express');
const router      = express.Router();
const controller  = require('./donations.controller');
const requireAuth = require('../../middleware/require-auth');
const { requireEntityOwnership } = require('../../middleware/entity-permission.middleware');

// Public — donors are not logged in
router.post('/',                          controller.createDonation);
router.post('/mock-complete',             controller.mockComplete);
router.get('/return',                     controller.handleReturn);
router.get('/public/:id',                 controller.getDonationPublic);
router.get('/campaign/:slug/donors',      controller.getCampaignDonors);
router.get('/campaign/:slug/live',        controller.getLiveDonations);
router.get('/receipt/:id',                controller.getReceipt);

// Authenticated — donor's own donation history
router.get('/my', requireAuth, controller.getMyDonations);

// Authenticated — entity manager
router.get('/entity/:id',          requireAuth, requireEntityOwnership(), controller.getEntityDonations);
router.get('/entity/:id/donors',   requireAuth, requireEntityOwnership(), controller.getEntityDonors);

module.exports = router;
