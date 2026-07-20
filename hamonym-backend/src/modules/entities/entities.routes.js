// src/modules/entities/entities.routes.js

const express = require('express');

const multer = require('multer');

const router = express.Router();

const controller =
  require('./entities.controller');

const requireAuth =
  require('../../middleware/require-auth');

const { requireEntityOwnership } =
  require('../../middleware/entity-permission.middleware');

const upload = multer({

  storage:
    multer.memoryStorage()

});

router.post(

  '/',

  requireAuth,

  controller.createEntity

);

router.get(

  '/my',

  requireAuth,

  controller.getMyEntities

);

router.patch(

   '/:id/association-document',

  (req, res, next) => {

    console.log('UPLOAD HIT');

    next();

  },

  requireAuth,

  requireEntityOwnership(),

  upload.single('file'),

  controller.uploadAssociationDocument

);

router.patch(

  '/:id/tax-document',

  requireAuth,

  requireEntityOwnership(),

  upload.single('file'),

  controller.uploadTaxDocument

);

router.get(

  '/:id/association-document',

  requireAuth,

  requireEntityOwnership(),

  controller.getAssociationDocument

);

router.get(

  '/:id/tax-document',

  requireAuth,

  requireEntityOwnership(),

  controller.getTaxDocument

);

router.patch(

  '/:id/logo',

  requireAuth,

  requireEntityOwnership(),

  upload.single('file'),

  controller.uploadLogo

);

/*router.get(

  '/:id/logo',

  controller.getLogo

);*/

router.get(

  '/:id',

  requireAuth,

  requireEntityOwnership(),

  controller.getEntityById

);

router.patch(

  '/:id',

  requireAuth,

  controller.updateEntity

);

router.delete(
  '/:id/tax-document',
  requireAuth,
  requireEntityOwnership(),
  controller.removeTaxDocument
);

router.delete(
  '/:id/association-document',
  requireAuth,
  requireEntityOwnership(),
  controller.removeAssociationDocument
);

router.get(
  '/:id/approval-status',
  requireAuth,
  controller.getApprovalStatus
);

router.patch(
  '/:id/request-review',
  requireAuth,
  controller.requestReview
);

router.get(
  '/:id/notifications',
  requireAuth,
  controller.getNotifications
);

router.post(
  '/:id/notifications/acknowledge',
  requireAuth,
  controller.acknowledgeNotifications
);

router.delete(
  '/:id',
  requireAuth,
  controller.softDeleteEntity
);

router.patch(
  '/:id/visibility',
  requireAuth,
  controller.setEntityVisibility
);

module.exports = router;
