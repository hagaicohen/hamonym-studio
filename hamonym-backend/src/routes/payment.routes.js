const express =
  require('express');

const router =
  express.Router();

const billingController =
  require('../modules/billing/billing.controller');

/* =========================================
   CARDCOM
========================================= */

router.post(

  '/cardcom/test-connection',

  billingController
    .testCardcomConnection
);

module.exports =
  router;