const express = require('express');
const router = express.Router();
const ctrl = require('./platform.controller');
const requireAuth = require('../../middleware/require-auth');
const requireSuperAdmin = require('../../middleware/require-super-admin');
const requirePlatformAccess = require('../../middleware/require-platform-access');
const requirePermission = require('../../middleware/require-permission');

// Any scoped admin (full super admin, or someone with at least one platform_permission) may
// enter /platform/* at all. Individual route groups below narrow further per section.
router.use(requireAuth, requirePlatformAccess);

router.get('/dashboard', ctrl.getDashboard);
router.get('/notifications-count', ctrl.getNotificationsCount);
router.get('/activity', ctrl.getActivity);

router.get('/organizations', requirePermission('organizations'), ctrl.getOrganizations);
// Partners reuse the 'organizations' permission scope (entity-management,
// adjacent concern) rather than a new permission key — adding a dedicated
// 'partners' scope would also require wiring it into the scoped-admin
// permission picker UI, out of scope for "add a partners list screen".
router.get('/partners', requirePermission('organizations'), ctrl.getPartners);
router.get('/organizations/:id', requirePermission('organizations'), ctrl.getOrganization);
router.post('/organizations/:id/approve', requirePermission('organizations'), ctrl.approve);
router.post('/organizations/:id/reject', requirePermission('organizations'), ctrl.reject);
router.post('/organizations/:id/request-changes', requirePermission('organizations'), ctrl.requestChanges);
router.post('/organizations/:id/suspend', requirePermission('organizations'), ctrl.suspend);
router.post('/organizations/:id/reactivate', requirePermission('organizations'), ctrl.reactivate);
router.post('/organizations/:id/hard-delete', requirePermission('organizations'), ctrl.hardDelete);
router.post('/organizations/:id/analyze', requirePermission('organizations'), ctrl.analyzeOrganization);
router.post('/organizations/:id/recommend', requirePermission('organizations'), ctrl.recommendOrganization);

router.get('/campaigns', requirePermission('campaigns'), ctrl.getCampaigns);
router.get('/campaigns/:id', requirePermission('campaigns'), ctrl.getCampaign);
router.post('/campaigns/:id/status', requirePermission('campaigns'), ctrl.setCampaignStatus);
router.post('/campaigns/:id/feature', requirePermission('campaigns'), ctrl.setCampaignFeatured);
router.post('/campaigns/:id/lock', requirePermission('campaigns'), ctrl.setCampaignLocked);
router.post('/campaigns/:id/delete', requirePermission('campaigns'), ctrl.deleteCampaign);
router.post('/campaigns/:id/restore', requirePermission('campaigns'), ctrl.restoreCampaign);
router.post('/campaigns/:id/transfer', requirePermission('campaigns'), ctrl.transferCampaignOwnership);
router.post('/campaigns/:id/slug', requirePermission('campaigns'), ctrl.setCampaignSlug);
router.post('/campaigns/:id/duplicate', requirePermission('campaigns'), ctrl.duplicateCampaign);

// User/admin management is never scoped — always full super admin only, to prevent
// a scoped admin from granting themselves (or anyone else) more access.
router.get('/roles', requireSuperAdmin, ctrl.getRoles);
router.get('/users', requireSuperAdmin, ctrl.getUsers);
router.get('/users/:id', requireSuperAdmin, ctrl.getUser);
router.post('/users', requireSuperAdmin, ctrl.createAdminUser);
router.post('/users/:id/status', requireSuperAdmin, ctrl.setUserActive);
router.post('/users/:id/delete', requireSuperAdmin, ctrl.deleteUser);
router.post('/users/:id/restore', requireSuperAdmin, ctrl.restoreUser);
router.post('/users/:id/reset-password-link', requireSuperAdmin, ctrl.generatePasswordResetLink);
router.post('/users/:id/impersonate', requireSuperAdmin, ctrl.impersonateUser);
router.post('/users/:id/super-admin', requireSuperAdmin, ctrl.setUserSuperAdmin);
router.post('/users/:id/permissions', requireSuperAdmin, ctrl.setUserPermissions);

module.exports = router;
