const express = require('express');
const controller = require('./comments.controller');
const requireAuth = require('../../middleware/require-auth');
const requireSuperAdmin = require('../../middleware/require-super-admin');

const router = express.Router();

// Public — anonymous visitors; published comments only, rate-limited posting.
router.get('/campaign/:slug', controller.getComments);
router.post('/campaign/:slug', controller.createComment);

// Super Admin — how requests reach this service (counts only, never addresses);
// used once to choose COMMENTS_TRUST_PROXY. See docs/COMMENTS_RELEASE.md.
router.get('/manage/_proxy-check', requireAuth, requireSuperAdmin, controller.proxyCheck);

// Management — the campaign's organization members, or Super Admin (checked in the service).
router.get('/manage/:campaignId', requireAuth, controller.listForManager);
router.patch('/manage/:campaignId/settings', requireAuth, controller.setModeration);
router.patch('/manage/:campaignId/:commentId', requireAuth, controller.setStatus);
router.delete('/manage/:campaignId/:commentId', requireAuth, controller.deleteComment);

// Which forwarded addresses to believe when identifying a visitor for rate
// limiting. Unset/false (the default) = none: the TCP peer is the visitor, so a
// visitor can never choose its own identity with X-Forwarded-For. A hop count
// or proxy addresses (Express "trust proxy" syntax) only after the production
// proxy chain has been verified. "true" (trust everything) is refused.
function trustSetting(raw) {
  const value = String(raw ?? '').trim();
  if (!value || /^(false|0|off|no)$/i.test(value)) return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (/^(true|on|yes|all)$/i.test(value)) {
    console.error('[comments] COMMENTS_TRUST_PROXY=true would trust any forwarded address; ignoring it (no proxy trusted)');
    return false;
  }
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

// A sub-application so the proxy trust applies to the comments routes only;
// every other route keeps the server's own settings.
function createCommentsApp({ trustProxy = process.env.COMMENTS_TRUST_PROXY } = {}) {
  const app = express();
  app.set('trust proxy', trustSetting(trustProxy));
  app.use(router);
  return app;
}

module.exports = createCommentsApp();
module.exports.createCommentsApp = createCommentsApp;
module.exports.trustSetting = trustSetting;
