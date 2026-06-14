const express =
  require('express');

const router =
  express.Router();

const controller =
  require('./campaigns.controller');

const requireAuth =
  require('../../middleware/require-auth');

// Public — no auth
router.get(
  '/public/:slug',
  controller.getCampaignBySlugPublic
);

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
  '/my-ambassador-campaigns',
  requireAuth,
  controller.myAmbassadorCampaigns
);

router.get(
  '/check-slug',
  requireAuth,
  controller.checkSlugAvailable
);

router.get(
  '/slug/:slug',
  requireAuth,
  controller.getCampaignBySlug
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

router.patch(
  '/:id/visibility',
  requireAuth,
  controller.setCampaignVisibility
);

module.exports =
  router;