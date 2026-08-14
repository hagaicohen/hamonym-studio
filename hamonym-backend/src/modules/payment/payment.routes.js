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

// Recurring webhooks arrive as application/x-www-form-urlencoded, not JSON
// like the LowProfile route above — the body parser is scoped to this route
// only, so it doesn't change how /webhook parses its own JSON body.
router.post(
  '/recurring-webhook',
  express.urlencoded({ extended: true }),
  paymentController.handleRecurringWebhook
);

module.exports = router;