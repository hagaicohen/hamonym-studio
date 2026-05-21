const express =
  require('express');

const controller =
  require('./billing.controller');

const cardcomRoutes =
  require('./cardcom.routes');

const router =
  express.Router();

/* =========================================
   BILLING
========================================= */

router.get(

  '/entity/:entityId',

  controller.getEntityBilling
);

router.post(

  '/',

  controller.createBilling
);

router.delete(

  '/:id',

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
   CARDCOM ROUTES
========================================= */

router.use(

  '/cardcom',

  cardcomRoutes
);

module.exports =
  router;