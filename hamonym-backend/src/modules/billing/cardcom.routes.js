const express =
  require('express');

const axios =
  require('axios');

const router =
  express.Router();

/* =========================================
   TEST CONNECTION
========================================= */

router.post(
  '/test-connection',

  async (req, res) => {

    try {

      const {
        terminalNumber,
        apiName,
        apiPassword,
        environment
      } = req.body;

      /* =========================
         VALIDATION
      ========================= */

      if (
        !terminalNumber ||
        !apiName ||
        !apiPassword
      ) {

        return res.status(400).json({

          success: false,

          message:
            'חסרים פרטי התחברות'
        });
      }

      console.log(
        'TEST CARDCOM CONNECTION'
      );

      console.log({

        terminalNumber,

        apiName,

        environment
      });

      /* =========================
         PAYLOAD
      ========================= */

      const payload = {

        TerminalNumber:
          terminalNumber,

        ApiName:
          apiName,

        ApiPassword:
          apiPassword,

        SuccessRedirectUrl:
          'https://example.com/success',

        FailedRedirectUrl:
          'https://example.com/failed',

        WebHookUrl:
          'https://example.com/webhook',

        Document: {

          Products: [

            {

              Description:
                'Connection Test',

              UnitCost:
                1,

              Quantity:
                1
            }
          ]
        },

        Amount:
          1,

        Language:
          'he'
      };

      /* =========================
         REQUEST
      ========================= */

      const response =
        await axios.post(

          'https://secure.cardcom.solutions/api/v11/LowProfile/Create',

          payload,

          {

            headers: {

              'Content-Type':
                'application/json'
            }
          }
        );

      console.log(
        'CARDCOM RESPONSE',
        response.data
      );

      /* =========================
         SUCCESS
      ========================= */

      if (
        response.data?.ResponseCode === 0
      ) {

        return res.json({

          success: true,

          message:
            'החיבור תקין'
        });
      }

      /* =========================
         FAILED
      ========================= */

      return res.json({

        success: false,

        message:

          response.data
            ?.Description ||

          'שגיאה בחיבור לקארדקום'
      });

    } catch (err) {

      console.error(
        'CARDCOM TEST ERROR',
        err?.response?.data || err
      );

      return res.status(500).json({

        success: false,

        message:
          'שגיאת שרת'
      });
    }
  }
);

module.exports =
  router;