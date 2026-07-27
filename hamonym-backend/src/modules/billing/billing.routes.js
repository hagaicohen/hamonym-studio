const express =
  require('express');

const controller =
  require('./billing.controller');

const cardcomRoutes =
  require('./cardcom.routes');

const requireAuth =
  require('../../middleware/require-auth');

const { requireEntityOwnership } =
  require('../../middleware/entity-permission.middleware');

const router =
  express.Router();

/* =========================================
   BILLING
========================================= */

router.get(

  '/entity/:entityId',

  requireAuth,
  requireEntityOwnership('entityId'),
  controller.getEntityBilling
);

// NB: createBilling reads entityId from the body (part of a Cardcom
// OpenFields completion flow, not a simple :id-param route) and
// deleteBilling looks up a billing-record id whose owning entity isn't
// resolved before this middleware would run — an ownership check for these
// two needs a bit more care than a drop-in requireEntityOwnership() call.
// Only closing the "not authenticated at all" hole here for now; see
// docs/DECISIONS.md (2026-07-15) entity-ownership audit for the rest.
router.post(

  '/',

  requireAuth,
  controller.createBilling
);

router.delete(

  '/:id',

  requireAuth,
  controller.deleteBilling
);

/* =========================================
   OPENFIELDS
========================================= */

router.post(

  '/init-openfields',

  controller.createLowProfile
);

/* =========================================
   CARDCOM CALLBACK
========================================= */

router.post(

  '/cardcom/callback',

  controller.cardcomCallback
);

/* =========================================
   BILLING  ROUTES
========================================= */

router.use(

  '/cardcom',

  cardcomRoutes
);

module.exports =
  router;


router.post(

  '/create-low-profile',

  controller.createLowProfile
);

router.get(

  '/low-profile-result/:lowProfileId',

  controller.getLowProfileResult
);