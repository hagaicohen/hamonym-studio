// cardcom.service.js

const axios =
  require('axios');

exports.createOpenFieldsLowProfile =
  async (entityId) => {

    const payload = {

      TerminalNumber:
        process.env.HAMONYM_CARDCOM_TERMINAL,

      ApiName:
        process.env.HAMONYM_CARDCOM_API_NAME,

      ApiPassword:
        process.env.HAMONYM_CARDCOM_API_PASSWORD,

      Operation:
        'CreateToken',

      Amount: 1,

      CoinId: 1,

      CreateToken:
        true,

      Language:
        'he',

      SuccessRedirectUrl:

        `${process.env.FRONTEND_URL}/settings/entities/${entityId}?LowProfileId=[lowprofileid]&InternalDealNumber=[internaldealnumber]`,

      FailedRedirectUrl:

        `${process.env.FRONTEND_URL}/settings/entities/${entityId}`,

      ReturnValue:
        entityId
    };

    console.log(
      'SUCCESS URL',
      payload.SuccessRedirectUrl
    );

    console.log(
      'OPENFIELDS PAYLOAD',
      payload
    );

    try {

      const response =
        await axios.post(

          'https://secure.cardcom.solutions/api/v11/LowProfile/Create',

          payload
        );

      console.log(
        'OPENFIELDS RESPONSE',
        response.data
      );

      console.log(
        JSON.stringify(
          response.data,
          null,
          2
        )
      );

      console.log(
        'LOW PROFILE URL',
        `https://secure.cardcom.solutions/External/LowProfile.aspx?LowProfileId=${response.data.LowProfileId}`
      );

      return {

            terminalNumber:
              process.env.HAMONYM_CARDCOM_TERMINAL,

            apiName:
              process.env.HAMONYM_CARDCOM_API_NAME,

            lowProfileId:
              response.data.LowProfileId,

            lowProfileUrl:

              response.data.Url ||

              response.data.LowProfileUrl ||

              `https://secure.cardcom.solutions/External/LowProfile.aspx?LowProfileId=${response.data.LowProfileId}`
          };

    } catch (error) {

      console.log(
        'CARDCOM ERROR RESPONSE',
        error.response?.data
      );

      console.log(
        'CARDCOM ERROR MESSAGE',
        error.message
      );

      throw error;
    }

  };

exports.testConnection =
  async () => {

    const payload = {

      TerminalNumber:
        process.env.HAMONYM_CARDCOM_TERMINAL,

      ApiName:
        process.env.HAMONYM_CARDCOM_API_NAME,

      ApiPassword:
        process.env.HAMONYM_CARDCOM_API_PASSWORD,

      Operation:
        'ChargeOnly',

      Amount: 0,

      CoinId: 1
    };

    try {

      const response =
        await axios.post(

          'https://secure.cardcom.solutions/api/v11/LowProfile/Create',

          payload
        );

      return {

        success: true,

        response:
          response.data

      };

    } catch (error) {

      return {

        success: false,

        error:
          error.response?.data || error.message

      };

    }

  };