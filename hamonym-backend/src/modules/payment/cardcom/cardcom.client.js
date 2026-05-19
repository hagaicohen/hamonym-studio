const axios = require('axios');

exports.testConnection =
  async (config) => {

    const url =
      config.environment === 'sandbox'
        ? 'https://secure.cardcom.solutions/api/v11/LowProfile/Create'
        : 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';

    const payload = {

      TerminalNumber:
        config.terminalNumber,

      ApiName:
        config.apiName,

      ApiPassword:
        config.apiPassword,

      Amount: 5,

      SuccessRedirectUrl:
        'https://example.com/success',

      FailedRedirectUrl:
        'https://example.com/fail',

      ReturnValue:
        'hamonym-test',

      Document: {
        To: 'Hamonym Test',
        Email: 'test@test.com',

        Products: [
          {
            Description:
              'Connection Test',

            UnitCost: 5
          }
        ]
      }
    };

    try {

      const response =
        await axios.post(
          url,
          payload,
          {
            headers: {
              'Content-Type':
                'application/json'
            }
          }
        );

      return {
        success: true,
        data: response.data
      };

    } catch (err) {

      return {
        success: false,
        error:
          err.response?.data ||
          err.message
      };
    }
  };