const axios = require('axios');

// LowProfile/Create (REST v11) — the donation checkout session. Extracted
// verbatim out of donations.service.js::createDonation (Phase B1,
// 2026-10-09), which was the only CardCom call in the donation rail with no
// client of its own. Pure transport: the caller still builds the entire
// payload (credentials, Amount, Operation, redirect URLs, WebHookUrl,
// ReturnValue, Document) and still owns every decision about it — this
// module only puts it on the wire.
//
// Log only diagnostic codes; rethrow the identical error for existing handling.
const CARDCOM_CREATE_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';

exports.CARDCOM_CREATE_URL = CARDCOM_CREATE_URL;

exports.createLowProfile = async (payload) => {
  try {
    const response = await axios.post(CARDCOM_CREATE_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    const responseCode = error.response?.data?.ResponseCode;
    console.error('[CardCom LowProfile/Create] request failed', {
      code: typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : 'UNKNOWN',
      httpStatus: Number.isInteger(error.response?.status) ? error.response.status : null,
      providerCode: /^-?\d{1,8}$/.test(String(responseCode)) ? Number(responseCode) : null,
    });
    throw error;
  }
};
