const express =
  require('express');

const router =
  express.Router();

const requireAuth =
  require('../../middleware/require-auth');

router.get(

  '/',

  requireAuth,

  (req, res) => {

    res.json({

      message:
        'Authorized',

      user:
        req.user

    });

  }

);

module.exports =
  router;