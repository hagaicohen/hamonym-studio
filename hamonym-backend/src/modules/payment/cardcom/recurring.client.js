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

// Operation=update against an existing RecurringId — Pause/Resume/Skip all
// go through this one call, they just differ in which fields they set.
// Verified empirically (2026-08-14): IsActive=false pauses (job stops
// billing, NextDateToBill freezes, MasterRecurring fires); IsActive=true +
// an explicit NextDateToBill resumes cleanly. Only include the fields the
// caller actually wants to change — Pause has no reason to also touch
// NextDateToBill, and sending fields CardCom doesn't expect to change is
// exactly the kind of unverified side effect this project has been bitten
// by before.
exports.updateRecurring = async ({
  terminalNumber, userName, apiPassword, recurringId, isActive, nextDateToBill,
}) => {
  const params = new URLSearchParams({
    TerminalNumber: terminalNumber,
    UserName: userName,
    ApiPassword: apiPassword || '',
    codepage: '65001',
    Operation: 'update',
    'RecurringPayments.RecurringId': recurringId,
  });
  if (isActive !== undefined) params.set('RecurringPayments.IsActive', isActive ? 'true' : 'false');
  if (nextDateToBill) params.set('RecurringPayments.NextDateToBill', nextDateToBill);

  const response = await axios.post(RECURRING_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  return parseNameToValueResponse(response.data);
};
