const express =
  require('express');

const router =
  express.Router();

const controller =
  require('./campaign-creation.controller');

const requireAuth =
  require('../../middleware/require-auth');

router.post(
  '/extract',
  requireAuth,
  controller.extractAndBuildBrief
);

module.exports =
  router;
