const express    = require('express');
const router     = express.Router();
const controller = require('./donations.controller');

// Public — donors are not logged in
router.post('/',              controller.createDonation);
router.get('/return',         controller.handleReturn);
router.get('/public/:id',     controller.getDonationPublic);

module.exports = router;
