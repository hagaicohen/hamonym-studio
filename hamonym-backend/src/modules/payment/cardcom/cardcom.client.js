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

// Recurring reconciliation (Donation Engine closure WP2, 2026-08-31) —
// GetRecurringPaymentHistory (REST v11) is the authoritative,
// webhook-independent source for "what did CardCom actually charge on this
// recurring instruction". Verified against the official v11 swagger:
// query is by AccountId (CardCom's account/customer number --
// recurring_instructions.cardcom_account_id -- NOT the same field as
// RecurringId, they are separate properties on both the request and the
// response items) plus a FromDate/ToDate window in DDMMYYYY. Response items
// carry TranzactionId/RowID/PaymentNum/CreateDate/SumToBill/Status per
// instruction (filter the response by RecurringId client-side -- the API
// itself doesn't take RecurringId as a filter for History, only for the
// separate, non-history GetRecurringPayment endpoint). This is a GET with a
// JSON request body per the official spec (unusual, but that's what
// CardCom's own swagger declares) -- axios needs `data` set explicitly on a
// GET call for that.
// Note: RecurringPaymentHistoryQuery has no TerminalNumber field at all
// (verified against the schema, additionalProperties:false) -- scoping is
// by AccountId + the credential pair alone, unlike every other call in this
// file. Do not add one.
exports.getRecurringPaymentHistory =
  async ({ apiName, apiPassword, accountId, fromDate, toDate }) => {

    const response =
      await axios({
        method: 'get',
        url: 'https://secure.cardcom.solutions/api/v11/RecuringPayments/GetRecurringPaymentHistory',
        data: {
          apiUserName: apiName,
          apiPassword,
          AccountId: accountId,
          FromDate: fromDate,
          ToDate: toDate,
        },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

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