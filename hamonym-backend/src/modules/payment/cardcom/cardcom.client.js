const axios = require('axios');

exports.getLpResult =
  async ({ terminalNumber, apiName, apiPassword, lowProfileId }) => {

    const response =
      await axios.post(

        'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult',

        {
          TerminalNumber: terminalNumber,
          ApiName: apiName,
          ApiPassword: apiPassword,
          LowProfileId: lowProfileId,
        },

        { timeout: 15000 }
      );

    return response.data;
  };

// Token charge for the Collection Engine (docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md,
// docs/CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH_2026-08-28.md). Request
// shape verified directly against the official v11 TransactionReq schema and
// CardCom's own "Do Transaction" support article (2026-08-29):
//   - required: TerminalNumber, ApiName, Amount.
//   - ApiPassword is NOT part of this request at all for a plain charge --
//     it only exists nested under Advanced.ApiPassword, and only then
//     "required if IsRefund is true". TransactionReq has
//     additionalProperties:false, so a stray top-level ApiPassword would
//     make CardCom reject the whole request -- do not add one here.
//   - CVV2 deliberately omitted: CardCom's own docs state a token/no-CVV
//     terminal "does not check CVV" for token charges. entity_billing never
//     stores CVV (PCI DSS forbids retaining it past authorization) -- this
//     is the documented model, not a workaround.
//   - CardExpirationMMYY is sent even though the OpenAPI schema marks it
//     nullable -- CardCom's own field table calls it mandatory for Do
//     Transaction. Do not remove it on the strength of the OpenAPI
//     annotation alone.
exports.chargeToken =
  async ({ terminalNumber, apiName, amount, token, cardExpirationMMYY, externalUniqTranId, isoCoinId }) => {

    const response =
      await axios.post(

        'https://secure.cardcom.solutions/api/v11/Transactions/Transaction',

        {
          TerminalNumber: terminalNumber,
          ApiName: apiName,
          Amount: amount,
          Token: token,
          CardExpirationMMYY: cardExpirationMMYY,
          ExternalUniqTranId: externalUniqTranId,
          ISOCoinId: isoCoinId || 1,
        },

        { timeout: 15000 }
      );

    return response.data;
  };

// Ambiguity resolution (design doc §6.5/§8.2) -- "ask the provider, never
// guess", same principle as getLpResult's use in stale-pending-donations.job.js.
// Must be called with the SAME externalUniqTranId originally submitted to
// chargeToken -- never a newly generated one, or this looks up the wrong attempt.
exports.getTransactionByExternalUniqTran =
  async ({ terminalNumber, apiName, externalUniqTranId }) => {

    const response =
      await axios.post(

        'https://secure.cardcom.solutions/api/v11/Transactions/GetTransactionByExternalUniqTran',

        {
          TerminalNumber: terminalNumber,
          ApiName: apiName,
          ExternalUniqTranId: externalUniqTranId,
        },

        { timeout: 15000 }
      );

    return response.data;
  };

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