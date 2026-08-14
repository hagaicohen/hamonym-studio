const axios = require('axios');

// CardCom's Name-to-Value API (v10) — the only Create/Update interface for
// Recurring, confirmed directly by CardCom support. There is no REST v11
// equivalent (verified against the live v11 swagger spec — see
// docs/CARDCOM_RECURRING_ARCHITECTURE.md). Flat key=value wire format, not
// JSON — kept in its own client, separate from cardcom.client.js (REST v11),
// per docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md §4.
const RECURRING_URL = 'https://secure.cardcom.solutions/interface/RecurringPayment.aspx';

function parseNameToValueResponse(raw) {
  const params = new URLSearchParams(String(raw));
  const result = {};
  for (const [key, value] of params) result[key] = value;
  return result;
}

// LowProfileDealGuid must come from a LowProfile created with
// Operation=ChargeAndCreateToken — ChargeOnly fails with ResponseCode=8500
// ("Low Profile Deal have no token"), verified empirically.
exports.createRecurring = async ({
  terminalNumber, userName, apiPassword, chargeInTerminal,
  lowProfileDealGuid, donorName, amount, invoiceDescription,
  internalDescription, nextDateToBill, totalNumOfBills, timeIntervalId, returnValue,
}) => {
  const params = new URLSearchParams({
    TerminalNumber: terminalNumber,
    UserName: userName,
    ApiPassword: apiPassword || '',
    codepage: '65001',
    Operation: 'NewAndUpdate',
    LowProfileDealGuid: lowProfileDealGuid,
    'Account.CompanyName': donorName || '',
    'RecurringPayments.ChargeInTerminal': chargeInTerminal,
    'RecurringPayments.InternalDecription': internalDescription || '',
    'RecurringPayments.NextDateToBill': nextDateToBill,
    'RecurringPayments.TotalNumOfBills': totalNumOfBills,
    'RecurringPayments.TimeIntervalId': timeIntervalId,
    'RecurringPayments.FinalDebitCoinId': '1',
    'RecurringPayments.ReturnValue': returnValue || '',
    'RecurringPayments.FlexItem.InvoiceDescription': invoiceDescription || '',
    'RecurringPayments.FlexItem.Price': amount,
  });

  const response = await axios.post(RECURRING_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  return parseNameToValueResponse(response.data);
};
