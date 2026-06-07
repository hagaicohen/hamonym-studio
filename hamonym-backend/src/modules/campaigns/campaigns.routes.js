const express =
  require('express');

const router =
  express.Router();

const controller =
  require('./campaigns.controller');

const requireAuth =
  require('../../middleware/require-auth');

router.post(
  '/',
  requireAuth,
  controller.createCampaign
);

router.get(
  '/my',
  requireAuth,
  controller.getMyCampaigns
);

router.get(
  '/:id',
  requireAuth,
  controller.getCampaignById
);

router.patch(
  '/:id',
  requireAuth,
  controller.updateCampaign
);

router.delete(
  '/:id',
  requireAuth,
  controller.deleteCampaign
);

module.exports =
  router;