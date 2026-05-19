// src/modules/entities/entities.routes.js

const express = require('express');

const multer = require('multer');

const router = express.Router();

const controller =
  require('./entities.controller');

const requireAuth =
  require('../../middleware/require-auth');

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

  upload.single('file'),

  controller.uploadAssociationDocument

);

router.patch(

  '/:id/tax-document',

  requireAuth,

  upload.single('file'),

  controller.uploadTaxDocument

);

router.get(

  '/:id/association-document',

  controller.getAssociationDocument

);

router.get(

  '/:id/tax-document',

  controller.getTaxDocument

);

router.patch(

  '/:id/logo',

  requireAuth,

  upload.single('file'),

  controller.uploadLogo

);

/*router.get(

  '/:id/logo',

  controller.getLogo

);*/

router.patch(

  '/:id',

  requireAuth,

  controller.updateEntity

);

module.exports = router;