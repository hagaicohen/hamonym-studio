// Local mocked test for the temporary POST /api/platform/cardcom-ops/
// diagnostics/hamonym-token-charge endpoint (2026-08-30), before it's
// deployed and used to make one real CardCom charge. No real network call,
// no real DB query -- both axios.post and billingRepository are
// monkey-patched. Same technique as the other scripts/test-cardcom-*.js
// files in this directory.
//
// Run: node scripts/test-cardcom-token-charge-diagnostic.js

const assert = require('assert');
const axios = require('axios');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return fn()
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.message); });
}

function mockPost(impl) { axios.post = impl; }

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function freshController() {
  delete require.cache[require.resolve('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter')];
  delete require.cache[require.resolve('../src/modules/payment/cardcom/cardcom.client')];
  delete require.cache[require.resolve('./../src/modules/platform/cardcom-ops/cardcom-ops.controller')];
  return require('../src/modules/platform/cardcom-ops/cardcom-ops.controller');
}

const FAKE_INSTRUMENT = { token: 'fake-token-guid', exp_month: '9', exp_year: '2029', last4: '0000' };

async function run() {
  process.env.HAMONYM_CARDCOM_TERMINAL = '1000';
  process.env.HAMONYM_CARDCOM_API_NAME = 'test-api-name';

  await check('no active payment instrument -> 404, no CardCom call made', async () => {
    const billingRepository = require('../src/modules/billing/billing.repository');
    billingRepository.getActiveDefaultByEntityId = async () => null;
    let called = false;
    mockPost(async () => { called = true; throw new Error('should not be called'); });
    const ctrl = freshController();
    const res = fakeRes();
    await ctrl.diagnoseHamonymTokenCharge({}, res);
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(called, false);
  });

  await check('charge succeeds -> reconcile is called automatically, no token in response', async () => {
    const billingRepository = require('../src/modules/billing/billing.repository');
    billingRepository.getActiveDefaultByEntityId = async () => FAKE_INSTRUMENT;
    let callCount = 0;
    mockPost(async (url) => {
      callCount++;
      if (url.includes('/Transactions/Transaction')) return { data: { ResponseCode: 0, TranzactionId: 777 } };
      if (url.includes('GetTransactionByExternalUniqTran')) return { data: { ResponseCode: 0, TranzactionId: 777 } };
      throw new Error('unexpected url ' + url);
    });
    const ctrl = freshController();
    const res = fakeRes();
    await ctrl.diagnoseHamonymTokenCharge({}, res);
    assert.strictEqual(res.body.chargeResult.outcome, 'succeeded');
    assert.strictEqual(res.body.reconcileResult.outcome, 'succeeded');
    assert.strictEqual(callCount, 2);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes(FAKE_INSTRUMENT.token));
    assert.ok(!serialized.includes('test-api-name'));
  });

  await check('charge declined -> reconcile is skipped, not called', async () => {
    const billingRepository = require('../src/modules/billing/billing.repository');
    billingRepository.getActiveDefaultByEntityId = async () => FAKE_INSTRUMENT;
    let called = false;
    mockPost(async (url) => {
      if (url.includes('/Transactions/Transaction')) return { data: { ResponseCode: 3, Description: 'Card declined' } };
      called = true;
      throw new Error('reconcile should not have been called');
    });
    const ctrl = freshController();
    const res = fakeRes();
    await ctrl.diagnoseHamonymTokenCharge({}, res);
    assert.strictEqual(res.body.chargeResult.outcome, 'declined');
    assert.strictEqual(res.body.reconcileResult, null);
    assert.ok(res.body.reconcileSkippedReason.includes('declined'));
    assert.strictEqual(called, false);
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
