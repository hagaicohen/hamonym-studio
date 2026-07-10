const express = require('express');
const router = express.Router();
const controller = require('./social-meta.controller');

// "Dynamic rendering" for crawlers that don't execute JS (WhatsApp/Facebook/
// LinkedIn link unfurlers, Twitter, non-Google search engines). Mounted at
// root (not /api) so the path shape matches the SPA's own public campaign
// URL (/campaigns/:slug) — once hosting is chosen, a rewrite rule there for
// known bot user-agents can point straight at this route with no path
// rewriting needed. See server.js for the mount point and the note on why
// this can't be wired to intercept real traffic yet.
router.get('/campaigns/:slug', controller.campaignMeta);

module.exports = router;
