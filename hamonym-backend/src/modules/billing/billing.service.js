// billing.service.js

const repository =
  require('./billing.repository');

const axios =
  require('axios');

/* =========================================
   GET ENTITY BILLING
========================================= */

exports.getEntityBilling =
  async (entityId) => {

    return repository
      .getByEntityId(entityId);

  };

/* =========================================
   CREATE BILLING
========================================= */
exports.createBilling =
  async (data) => {

    /* =========================
       GET LP RESULT
    ========================= */

    const response =
      await axios.post(

        'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult',

        {

          TerminalNumber:
            process.env
              .HAMONYM_CARDCOM_TERMINAL,

          ApiName:
            process.env
              .HAMONYM_CARDCOM_API_NAME,

          ApiPassword:
            process.env
              .HAMONYM_CARDCOM_API_PASSWORD,

          LowProfileId:
            data.lowProfileId,

          InternalDealNumber:
            data.internalDealNumber

        }

      );

    console.log(

      'GET LP RESULT',

      JSON.stringify(
        response.data,
        null,
        2
      )

    );

    const result =
      response.data;

    console.log(

      'FULL RESULT',

      JSON.stringify(
        result,
        null,
        2
      )

    );

    /* =========================
       VALIDATION
    ========================= */

    if (
      result?.ResponseCode !== 0
    ) {

      throw new Error(

        result?.Description ||

        'CardCom error'

      );

    }

    /* =========================
       EXTRACT DATA
    ========================= */

    const token =

      result?.TokenInfo
        ?.Token ||

      result?.Token ||

      result?.CardToken ||

      result?.TranzactionInfo
        ?.Token ||

      null;

    console.log(
      'EXTRACTED TOKEN',
      token
    );

    const last4 =

      result?.TranzactionInfo
        ?.Last4CardDigitsString ||

      null;

    const expMonth =

  result?.TokenInfo
    ?.CardMonth ||

  data.expMonth ||

  null;

const expYear =

  result?.TokenInfo
    ?.CardYear ||

  data.expYear ||

  null;

    const cardHolderName =

      result?.UIValues
        ?.CardOwnerName ||

      null;

    /* =========================
       REPLACE EXISTING TOKEN
    ========================= */

    await repository
      .deactivateEntityBilling(

        data.entityId
        

      );

    /* =========================
       SAVE BILLING
    ========================= */

    return repository
      .create({

        entity_id:
          data.entityId,

        provider:
          data.provider ||

          'cardcom',

        token,

        last4,

        exp_month:
          expMonth,

        exp_year:
          expYear,

        card_holder_name:
          cardHolderName

      });

  };

/* =========================================
   DELETE BILLING
========================================= */

exports.deleteBilling =
  async (id) => {

    return repository
      .remove(id);

  };

/* =========================================
   HANDLE CARDCOM CALLBACK
========================================= */

exports.handleCardcomCallback =
  async (payload) => {

    console.log(
      'CARDCOM CALLBACK',
      payload
    );

    return {
      success: true
    };

  };

/* =========================================
   GET LOW PROFILE RESULT
========================================= */

exports.getLowProfileResult =
  async (lowProfileId) => {

    const response =
      await axios.post(

        'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult',

        {

          TerminalNumber:
            process.env
              .HAMONYM_CARDCOM_TERMINAL,

          ApiName:
            process.env
              .HAMONYM_CARDCOM_API_NAME,

          ApiPassword:
            process.env
              .HAMONYM_CARDCOM_API_PASSWORD,

          LowProfileId:
            lowProfileId

        }

      );

    return response.data;

  };