// Local mocked test for the temporary /api/platform/cardcom-ops/diagnostics/
// hamonym-terminal-auth endpoint (2026-08-30), before it's relied on against
// the real Render deployment. No real network call, no DB. Same
// monkey-patched-axios technique as scripts/test-cardcom-token-charge-adapter.js.
//
// Run: node scripts/test-cardcom-terminal-auth-diagnostic.js

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
  delete require.cache[require.resolve('../src/modules/billing/billing.service')];
  delete require.cache[require.resolve('./../src/modules/platform/cardcom-ops/cardcom-ops.controller')];
  return require('../src/modules/platform/cardcom-ops/cardcom-ops.controller');
}

async function run() {
  process.env.HAMONYM_CARDCOM_TERMINAL = '1000';
  process.env.HAMONYM_CARDCOM_API_NAME = 'test-api-name';
  process.env.HAMONYM_CARDCOM_API_PASSWORD = 'test-password';

  await check('auth OK: HTTP 200 with a business ResponseCode (id not found) -> authenticationLikelySucceeded true', async () => {
    mockPost(async (url, body) => {
      assert.strictEqual(url, 'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult');
      assert.strictEqual(body.LowProfileId, '00000000-0000-0000-0000-000000000000');
      return { data: { ResponseCode: 2, Description: 'LowProfileId not found' } };
    });
    const ctrl = freshController();
    const res = fakeRes();
    await ctrl.diagnoseHamonymTerminalAuth({}, res);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.authenticationLikelySucceeded, true);
    assert.strictEqual(res.body.terminalNumber, '1000');
    assert.strictEqual(JSON.stringify(res.body).includes('test-password'), false);
  });

  await check('auth still failing: HTTP 401 (the historical 603 shape) -> authenticationLikelySucceeded false', async () => {
    mockPost(async () => {
      const e = new Error('Request failed with status code 401');
      e.response = { status: 401, data: { ResponseCode: 603, Description: 'שם משתמש או סיסמה שגויים' } };
      throw e;
    });
    const ctrl = freshController();
    const res = fakeRes();
    await ctrl.diagnoseHamonymTerminalAuth({}, res);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.authenticationLikelySucceeded, false);
    assert.strictEqual(res.body.cardcomResponseCode, 603);
  });

  await check('transport error (timeout) -> null authentication verdict, 502, no crash', async () => {
    mockPost(async () => { const e = new Error('timeout of 15000ms exceeded'); throw e; });
    const ctrl = freshController();
    const res = fakeRes();
    await ctrl.diagnoseHamonymTerminalAuth({}, res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.authenticationLikelySucceeded, null);
  });

  await check('response never contains ApiName/ApiPassword under any branch', async () => {
    for (const mock of [
      async () => ({ data: { ResponseCode: 0 } }),
      async () => { const e = new Error('x'); e.response = { status: 401, data: {} }; throw e; },
      async () => { throw new Error('network down'); },
    ]) {
      mockPost(mock);
      const ctrl = freshController();
      const res = fakeRes();
      await ctrl.diagnoseHamonymTerminalAuth({}, res);
      const serialized = JSON.stringify(res.body);
      assert.ok(!serialized.includes('test-api-name'));
      assert.ok(!serialized.includes('test-password'));
    }
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
