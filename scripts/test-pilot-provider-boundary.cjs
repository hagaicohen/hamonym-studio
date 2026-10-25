'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
process.env.NODE_PATH = path.resolve(__dirname, '../../hamonym-backend/node_modules');
Module._initPaths();
const root = process.env.HAMONYM_ADMIN_BACKEND_ROOT;
if (!root) throw new Error('HAMONYM_ADMIN_BACKEND_ROOT required');
const boundary = require(path.join(root, 'src/modules/payment/pilot-provider-boundary'));
test('pilot transport blocks actual CardCom before any network adapter is called', async () => {
  const axios = require('axios').create();
  let requests = 0;
  axios.defaults.adapter = async config => { requests++; return { status: 200, statusText: 'OK', data: {}, headers: {}, config }; };
  boundary.install(axios); boundary.install(axios);
  for (const endpoint of [
    'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult',
    'https://secure.cardcom.solutions/api/v11/Transactions/Transaction',
    'https://secure.cardcom.solutions/api/v11/RecuringPayments/GetRecurringPaymentHistory',
    'https://secure.cardcom.co.il/Interface/RecurringPayment.aspx',
  ]) await assert.rejects(axios.post(endpoint, {}), e => e.code === 'REAL_PROVIDER_DISABLED_DURING_PILOT');
  assert.equal(requests, 0);
  await axios.get('http://localhost/fixture');
  assert.equal(requests, 1);
});
test('mock donor verification cannot replay or invent historical donor payments', async () => {
  const provider = require(path.join(root, 'src/modules/payment/donation-provider')).getDonationProvider();
  assert.equal(provider.name, 'mock');
  assert.notEqual((await provider.getLpResult({ lowProfileId: 'historical-provider-id' })).ResponseCode, 0);
  assert.notEqual((await provider.getRecurringPaymentHistory({})).ResponseCode, 0);
  await assert.rejects(provider.createLowProfile({}), e => e.code === 'MOCK_DONATION_OPERATION_UNAVAILABLE');
});
