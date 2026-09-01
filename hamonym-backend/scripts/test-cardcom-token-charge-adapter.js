// Contract/unit self-test for the CardCom token-charge adapter
// (2026-08-29). No test framework exists in this repo yet (package.json has
// no jest/mocha) -- follows the repo's existing convention of a throwaway
// scripts/test-*.js run manually (see scripts/test-campaign-creation-*.js).
// Pure classification-logic tests: axios.post is monkey-patched in-process
// (no real network call), so this is safe to run with the live 603 blocker
// still in place and touches no database.
//
// Run: node scripts/test-cardcom-token-charge-adapter.js

const assert = require('assert');
const axios = require('axios');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return fn()
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.message); });
}

function mockPost(impl) {
  axios.post = impl;
}

async function run() {
  process.env.HAMONYM_CARDCOM_TERMINAL = '1000';
  process.env.HAMONYM_CARDCOM_API_NAME = 'test-api-name';

  const paymentInstrument = {
    token: '84cc1f4f-c089-410b-9f93-6437ac9abba6',
    exp_month: '9',
    exp_year: '2027',
    last4: '1234',
  };

  await check('success: ResponseCode 0 -> succeeded, providerReference is TranzactionId', async () => {
    delete require.cache[require.resolve('../src/modules/payment/cardcom/cardcom.client')];
    delete require.cache[require.resolve('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter')];
    mockPost(async (url, body) => {
      assert.strictEqual(url, 'https://secure.cardcom.solutions/api/v11/Transactions/Transaction');
      assert.strictEqual(body.TerminalNumber, '1000');
      assert.strictEqual(body.ApiName, 'test-api-name');
      assert.strictEqual(body.Token, paymentInstrument.token);
      assert.strictEqual(body.CardExpirationMMYY, '0927');
      assert.strictEqual(body.ExternalUniqTranId, 'attempt-1');
      assert.strictEqual(body.ApiPassword, undefined, 'ApiPassword must never be sent on TransactionReq (additionalProperties:false)');
      assert.strictEqual(body.CVV2, undefined, 'CVV2 must never be sent -- token/no-CVV model');
      return { data: { ResponseCode: 0, Description: 'OK', TranzactionId: 555444333 } };
    });
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    const result = await adapter.charge({ attemptId: 'attempt-1', amount: 120.5, paymentInstrument });
    assert.strictEqual(result.outcome, 'succeeded');
    assert.strictEqual(result.providerReference, '555444333');
  });

  await check('decline: non-zero, non-608 ResponseCode -> declined, raw code preserved', async () => {
    mockPost(async () => ({ data: { ResponseCode: 3, Description: 'Card declined' } }));
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    const result = await adapter.charge({ attemptId: 'attempt-2', amount: 50, paymentInstrument });
    assert.strictEqual(result.outcome, 'declined');
    assert.strictEqual(result.failureReason, 'cardcom_response_3');
    assert.ok(result.providerRawStatus.includes('Card declined'));
  });

  await check('duplicate: ResponseCode 608 -> ambiguous, not declined/failed', async () => {
    mockPost(async () => ({ data: { ResponseCode: 608, Description: 'Duplicate ExternalUniqTranId' } }));
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    const result = await adapter.charge({ attemptId: 'attempt-3', amount: 50, paymentInstrument });
    assert.strictEqual(result.outcome, 'ambiguous');
    assert.strictEqual(result.failureReason, 'external_uniq_tran_id_duplicate_608');
  });

  await check('transport error (no response, e.g. timeout) -> ambiguous, never declined', async () => {
    mockPost(async () => { const e = new Error('timeout of 15000ms exceeded'); e.code = 'ECONNABORTED'; throw e; });
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    const result = await adapter.charge({ attemptId: 'attempt-4', amount: 50, paymentInstrument });
    assert.strictEqual(result.outcome, 'ambiguous');
    assert.ok(result.failureReason.includes('cardcom_transport_error'));
  });

  await check('HTTP 401 (bad credentials, e.g. the live 603 case) -> technical_failure, not ambiguous', async () => {
    mockPost(async () => { const e = new Error('Request failed with status code 401'); e.response = { status: 401, data: { Description: 'Invalid username' } }; throw e; });
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    const result = await adapter.charge({ attemptId: 'attempt-5', amount: 50, paymentInstrument });
    assert.strictEqual(result.outcome, 'technical_failure');
    assert.strictEqual(result.failureReason, 'cardcom_http_401');
  });

  await check('MMYY builder normalizes single-digit month and 4-digit year', async () => {
    mockPost(async (url, body) => {
      assert.strictEqual(body.CardExpirationMMYY, '0326');
      return { data: { ResponseCode: 0, TranzactionId: 1 } };
    });
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    await adapter.charge({ attemptId: 'attempt-6', amount: 1, paymentInstrument: { token: 't', exp_month: '3', exp_year: '2026' } });
  });

  await check('MMYY builder also handles an already-2-digit year', async () => {
    mockPost(async (url, body) => {
      assert.strictEqual(body.CardExpirationMMYY, '1226');
      return { data: { ResponseCode: 0, TranzactionId: 1 } };
    });
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    await adapter.charge({ attemptId: 'attempt-7', amount: 1, paymentInstrument: { token: 't', exp_month: '12', exp_year: '26' } });
  });

  await check('reconcile: found successful transaction -> succeeded', async () => {
    mockPost(async (url, body) => {
      assert.strictEqual(url, 'https://secure.cardcom.solutions/api/v11/Transactions/GetTransactionByExternalUniqTran');
      assert.strictEqual(body.ExternalUniqTranId, 'attempt-8');
      return { data: { ResponseCode: 0, TranzactionId: 999 } };
    });
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    const result = await adapter.reconcile({ attemptId: 'attempt-8' });
    assert.strictEqual(result.outcome, 'succeeded');
    assert.strictEqual(result.providerReference, '999');
  });

  await check('reconcile: no matching transaction -> not_found (never a silent decline)', async () => {
    mockPost(async () => ({ data: { ResponseCode: 2, Description: 'Not found' } }));
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    const result = await adapter.reconcile({ attemptId: 'attempt-9' });
    assert.strictEqual(result.outcome, 'not_found');
  });

  await check('reconcile: lookup itself fails -> stays ambiguous, never guesses success/failure', async () => {
    mockPost(async () => { throw new Error('network down'); });
    const adapter = require('../src/modules/collection-engine/adapters/cardcom-token-charge.adapter');
    const result = await adapter.reconcile({ attemptId: 'attempt-10' });
    assert.strictEqual(result.outcome, 'ambiguous');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
