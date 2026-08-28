const express =
  require('express');

const controller =
  require('./billing.controller');

const cardcomRoutes =
  require('./cardcom.routes');

const repository =
  require('./billing.repository');

const requireAuth =
  require('../../middleware/require-auth');

const {
  requireEntityOwnership,
  requireBodyEntityOwnership,
  isEntityMember,
} = require('../../middleware/entity-permission.middleware');

const router =
  express.Router();

// entity_billing rows don't carry the caller's identity in the URL or body
// (DELETE only has the billing record's own :id) — resolve the owning
// entity_id from the row first, then check membership, same as every other
// ownership check in this file.
async function requireBillingRecordOwnership(req, res, next) {

  try {

    const entityId =
      await repository.getEntityIdById(req.params.id);

    if (!entityId) {
      return res.status(404).json({ error: 'Billing record not found' });
    }

    const ok =
      await isEntityMember(req.user?.id, entityId);

    if (!ok) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    next();

  } catch (err) {

    console.error('[requireBillingRecordOwnership] error:', err.message);

    res.status(500).json({ error: 'Authorization check failed' });

  }

}

/* =========================================
   BILLING
========================================= */

router.get(

  '/entity/:entityId',

  requireAuth,
  requireEntityOwnership('entityId'),
  controller.getEntityBilling
);

// Closes the gap left open by the 2026-07-15 entity-ownership audit
// (docs/DECISIONS.md): createBilling reads entityId from the body (a Cardcom
// OpenFields completion flow, not a simple :id-param route), and
// deleteBilling only has a billing-record id whose owning entity isn't known
// until the row is resolved — both needed a variant of the ownership check
// beyond the drop-in requireEntityOwnership() used elsewhere in this app.
router.post(

  '/',

  requireAuth,
  requireBodyEntityOwnership('entityId'),
  controller.createBilling
);

router.delete(

  '/:id',

  requireAuth,
  requireBillingRecordOwnership,
  controller.deleteBilling
);

/* =========================================
   OPENFIELDS
========================================= */

// Initiates a CardCom tokenization session scoped to entityId — doesn't
// persist anything itself, but same ownership rule applies: nobody should be
// able to kick off a card-replacement flow tagged with another entity's id.
router.post(

  '/init-openfields',

  requireAuth,
  requireBodyEntityOwnership('entityId'),
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
   BILLING  ROUTES
========================================= */

router.use(

  '/cardcom',

  cardcomRoutes
);

module.exports =
  router;

// Unused by the current frontend (BillingService.createLowProfile /
// .getLowProfileResult have no callers) but still live routes on this
// router — hardened to the same standard as the rest of this file rather
// than left as an unauthenticated duplicate of /init-openfields.
router.post(

  '/create-low-profile',

  requireAuth,
  requireBodyEntityOwnership('entityId'),
  controller.createLowProfile
);

router.get(

  '/low-profile-result/:lowProfileId',

  requireAuth,
  controller.getLowProfileResult
);