const express =
  require('express');

const controller =
  require('./payment-methods.controller');

const router =
  express.Router();

router.get(
  '/entity/:entityId',
  controller.getEntityPaymentMethod
);

router.post(
  '/',
  controller.createPaymentMethod
);

router.delete(
  '/:id',
  controller.deletePaymentMethod
);

module.exports = router;