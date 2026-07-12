// src/server.js

require('dotenv').config();

const express =
  require('express');

const cors =
  require('cors');

const app =
  express();

const paymentRoutes =
  require('./routes/payment.routes');
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

const ambassadorsRoutes =
  require('./modules/ambassadors/ambassadors.routes');

const dashboardRoutes =
  require('./modules/dashboard/dashboard.routes');

const reportsRoutes =
  require('./modules/reports/reports.routes');

const platformRoutes =
  require('./modules/platform/platform.routes');

const socialMetaRoutes =
  require('./modules/social-meta/social-meta.routes');

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
| START SERVER
|--------------------------------------------------------------------------
*/

const PORT =
  process.env.PORT || 3000;

app.listen(

  PORT,

  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }

);