const axios = require('axios');

// LowProfile/Create (REST v11) — the donation checkout session. Extracted
// verbatim out of donations.service.js::createDonation (Phase B1,
// 2026-10-09), which was the only CardCom call in the donation rail with no
// client of its own. Pure transport: the caller still builds the entire
// payload (credentials, Amount, Operation, redirect URLs, WebHookUrl,
// ReturnValue, Document) and still owns every decision about it — this
// module only puts it on the wire.
//
// The axios error is deliberately NOT caught or wrapped here: createDonation
// marks the donation 'failed' and then reads `err.response?.data?.Description`
// off the raw axios error. Catching it here would change the error shape
// business logic already pattern-matches on.
const CARDCOM_CREATE_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';

exports.CARDCOM_CREATE_URL = CARDCOM_CREATE_URL;

exports.createLowProfile = async (payload) => {
  const response = await axios.post(CARDCOM_CREATE_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  return response.data;
};
