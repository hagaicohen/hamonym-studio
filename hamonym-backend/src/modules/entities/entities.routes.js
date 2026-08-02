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

// Standalone Partner back-office (Scenario 0 / "Partner First") — entities
// the caller edits AND that actually hold the 'partner' role.
router.get(
  '/my-partners',
  requireAuth,
  controller.getMyPartners
);

// Partner Search — Phase 4 (Discovery). Platform-wide, any authenticated
// user; not scoped to the caller's own entities (that's the whole point).
router.get(
  '/search-partners',
  requireAuth,
  controller.searchPartners
);

// Public Partner Page — Phase 5, Sprint 5.1. No auth. Visibility gated
// inside the service (not deleted, not hidden, actually holds the
// 'partner' role) — everything else about "what to show" was already
// decided in the Builder/Domain, this route just reads it back.
router.get(
  '/:id/public',
  controller.getPublicPartner
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

// Entity Roles — Partner Domain Model (Phase 2). Unlike PATCH /:id above
// (which self-checks ownership inside the service), these use the
// requireEntityOwnership() middleware directly.
router.get(
  '/:id/roles',
  requireAuth,
  requireEntityOwnership(),
  controller.getRoles
);

router.post(
  '/:id/roles',
  requireAuth,
  requireEntityOwnership(),
  controller.addRole
);

router.delete(
  '/:id/roles/:role',
  requireAuth,
  requireEntityOwnership(),
  controller.removeRole
);

// Partner Draft — Page Builder Owner Context (Phase 3)
router.get(
  '/:id/draft',
  requireAuth,
  requireEntityOwnership(),
  controller.getDraft
);

router.patch(
  '/:id/draft',
  requireAuth,
  requireEntityOwnership(),
  controller.updateDraft
);

// Partner Invite — Phase 4 (Partner Management, Epic 3). Only an existing
// editor (user_entities row) can invite another one.
router.post(
  '/:id/invites',
  requireAuth,
  requireEntityOwnership(),
  controller.createInvite
);

module.exports = router;
