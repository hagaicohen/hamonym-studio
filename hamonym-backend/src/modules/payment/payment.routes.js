const express = require('express');

const router = express.Router();

const paymentController =
  require('./payment.controller');

router.post(
  '/cardcom/test-connection',
  paymentController.testCardcomConnection
);

router.post(
  '/webhook',
  paymentController.handleWebhook
);

module.exports = router;