const express = require('express');

const router = express.Router();

const paymentController =
  require('./payment.controller');

router.post(
  '/cardcom/test-connection',
  paymentController.testCardcomConnection
);

module.exports = router;