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

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/

app.use(cors());

app.use(express.json());

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