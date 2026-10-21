// src/server.js

require('dotenv').config();

const express =
  require('express');

const cors =
  require('cors');

const app =
  express();

const paymentRoutes = require('./modules/payment/payment.routes');
/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

const authRoutes =
  require('./routes/auth.routes');

const entitiesRoutes =
  require('./modules/entities/entities.routes');

const campaignsRoutes =
  require('./modules/campaigns/campaigns.routes');

const billingRoutes =
  require('./modules/billing/billing.routes');

const mediaRoutes =
  require('./modules/media/media.routes');

const donationsRoutes =
  require('./modules/donations/donations.routes');

const recurringRoutes =
  require('./modules/donations/recurring.routes');

const ambassadorsRoutes =
  require('./modules/ambassadors/ambassadors.routes');

const registrationsRoutes =
  require('./modules/registrations/registrations.routes');

const dashboardRoutes =
  require('./modules/dashboard/dashboard.routes');

const reportsRoutes =
  require('./modules/reports/reports.routes');

const platformRoutes =
  require('./modules/platform/platform.routes');

const socialMetaRoutes =
  require('./modules/social-meta/social-meta.routes');

const commentsRoutes =
  require('./modules/comments/comments.routes');

const campaignCreationRoutes =
  require('./modules/campaign-creation/campaign-creation.routes');

const campaignPartnersRoutes =
  require('./modules/campaign-partners/campaign-partners.routes');

const partnerInvitesRoutes =
  require('./modules/partner-invites/partner-invites.routes');

const partnerImportRoutes =
  require('./modules/partner-import/partner-import.routes');

const socialMetaController =
  require('./modules/social-meta/social-meta.controller');

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/

app.use(cors());

app.use(express.json());

app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t0}ms)`);
  });
  next();
});

// Centralized, not per-router -- see the middleware's own header comment.
// req.user isn't set yet at this point in the chain (whichever router's own
// requireAuth eventually handles the request sets it), but the listener it
// registers only fires after that's already happened.
app.use(require('./middleware/impersonation-audit.middleware'));

/*
|--------------------------------------------------------------------------
| API ROUTES
|--------------------------------------------------------------------------
*/

app.use(
  '/auth',
  authRoutes
);

app.use(
  '/api/entities',
  entitiesRoutes
);

app.use(
  '/api/campaigns',
  campaignsRoutes
);

app.use(
  '/api/billing',
  billingRoutes
);

app.use(
  '/api/media',
  mediaRoutes
);

app.use(
  '/api/donations',
  donationsRoutes
);

app.use(
  '/api/recurring',
  recurringRoutes
);

app.use(
  '/api/registrations',
  registrationsRoutes
);

app.use(
  '/api',
  ambassadorsRoutes
);

app.use(
  '/api/entities',
  dashboardRoutes
);

app.use(
  '/api/reports',
  reportsRoutes
);

app.use(
  '/api/platform',
  platformRoutes
);

app.use(
  '/api/comments',
  commentsRoutes
);

app.use(
  '/api/campaign-creation',
  campaignCreationRoutes
);

app.use(
  '/api/campaign-partners',
  campaignPartnersRoutes
);

app.use(
  '/api/invites',
  partnerInvitesRoutes
);

app.use(
  '/api/partner-import',
  partnerImportRoutes
);

/*
|--------------------------------------------------------------------------
| SOCIAL META / SEO — "dynamic rendering" for JS-blind crawlers
|--------------------------------------------------------------------------
| Mounted at root so /campaigns/:slug here mirrors the SPA's own public
| campaign URL 1:1. Not wired to intercept real traffic yet — the frontend
| is a separate host with no reverse proxy configured (production hosting
| isn't chosen yet). Once it is, route requests from known bot user-agents
| (facebookexternalhit, WhatsApp, LinkedInBot, Twitterbot, ...) hitting
| /campaigns/:slug to THIS backend's same path instead of the SPA.
*/
app.use('/', socialMetaRoutes);
app.get('/sitemap.xml', socialMetaController.sitemap);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get(

  '/',

  (req, res) => {

    res.json({

      success: true,

      message:
        'Hamonym backend running'

    });

  }

);

/*
|--------------------------------------------------------------------------
| PAYMENT - CARDCOM
|--------------------------------------------------------------------------
*/

app.use(
  '/api/payment',
  paymentRoutes
);

/*
|--------------------------------------------------------------------------
| TEMPORARY — CardCom OpenFields entity-credentials feasibility POC
| (2026-09-27). Isolated from all production payment code -- see
| modules/dev/openfields-poc.controller.js's own header comment. Remove
| this mount + that module + the frontend dev page together once the
| investigation closes.
|--------------------------------------------------------------------------
*/
app.use(
  '/api/dev/openfields-poc',
  require('./modules/dev/openfields-poc.routes')
);

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

const PORT =
  process.env.PORT || 3000;

const server = app.listen(

  PORT,

  () => {

    console.log(
      `Server running on port ${PORT}`
    );

    // Off by default — see docs/CARDCOM_OPERATIONAL_PROCESSES.md Part י'.
    // No runOnInit: jobs wait for their own next scheduled tick rather than
    // firing on every server start/deploy.
    //
    // Defense in depth (2026-10, simulation clock activation): never start
    // the real scheduler in a process where business time is simulated.
    // Every registered job reads clock.now() for its business-time
    // decision (Phase A) -- if HAMONYM_SIMULATION_MODE were ever 'on'
    // together with ENABLE_JOB_SCHEDULER='true' in the same process, a
    // REAL scheduled tick would make a REAL decision (e.g. "has the 28th
    // cutoff passed") against a FAKE date, against the real database. This
    // can never be a legitimate combination -- a simulation deployment has
    // no business running the real production job schedule at all.
    if (process.env.ENABLE_JOB_SCHEDULER === 'true' && !require('./lib/clock').isSimulationEnabled()) {
      require('./jobs/scheduler').start();
    }

  }

);

// Render sends SIGTERM before killing a dyno on deploy/restart/scale-down.
// Stops scheduling new job ticks so nothing new starts mid-shutdown — does
// not forcibly interrupt a run already in flight (see scheduler.js's own
// comment for why that's safe to leave alone).
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (process.env.ENABLE_JOB_SCHEDULER === 'true') {
    require('./jobs/scheduler').stop();
  }
  server.close(() => process.exit(0));
});