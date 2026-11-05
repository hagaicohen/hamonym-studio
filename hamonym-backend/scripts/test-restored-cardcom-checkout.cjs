const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const load = (relative, requireMock) => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), { module, exports: module.exports, require: requireMock, URL, WeakSet });
  return module.exports;
};
let interceptor;
const axios = { interceptors: { request: { use: fn => { interceptor = fn; } } } };
load('src/modules/payment/pilot-provider-boundary.js', () => axios).install(axios);
for (const endpoint of ['LowProfile/Create', 'LowProfile/GetLpResult']) {
  const config = { url: 'https://secure.cardcom.solutions/api/v11/' + endpoint };
  assert.equal(interceptor(config), config);
}
assert.throws(() => interceptor({ url: 'https://secure.cardcom.solutions/api/v11/Transactions/Transaction' }), { code: 'REAL_PROVIDER_DISABLED_DURING_PILOT' });
assert.throws(() => interceptor({ url: 'https://evil.cardcom.solutions/api/v11/LowProfile/Create' }), { code: 'REAL_PROVIDER_DISABLED_DURING_PILOT' });
let called;
const client = { createLowProfile: payload => { called = payload; return { LowProfileId: 'test' }; } };
const restored = load('src/modules/payment/donation-provider.js', () => load('src/modules/payment/cardcom/donation.provider.js', () => client));
assert.equal(restored.getDonationProvider().name, 'cardcom');
assert.equal(restored.getDonationProvider().createLowProfile({ Amount: 100 }).LowProfileId, 'test');
assert.equal(called.Amount, 100);
assert(!fs.readFileSync(path.join(root, 'src/modules/donations/donations.routes.js'), 'utf8').includes('mock-complete'));
assert(!fs.readFileSync(path.join(root, 'src/modules/payment/webhook.dispatcher.js'), 'utf8').includes('PILOT_REAL_PROVIDER_EVENTS_DISABLED'));
console.log('PASS: original donation facade, donor endpoints, webhook routing, removed mock endpoint; platform charge remains blocked. No HTTP or DB calls.');

(async () => {
  for (const error of [
    Object.assign(new Error('secret credentials'), { code: 'ECONNRESET' }),
    Object.assign(new Error('secret token'), { code: 'ERR_BAD_REQUEST', response: { status: 400, data: { ResponseCode: 603, ApiPassword: 'never-log' } } }),
  ]) {
    let logged;
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'src/modules/payment/cardcom/lowprofile.client.js'), 'utf8'), {
      module, exports: module.exports,
      require: () => ({ post: async () => { throw error; } }),
      console: { error: (...args) => { logged = args; } },
    });
    await assert.rejects(module.exports.createLowProfile({ ApiPassword: 'never-log' }), e => e === error);
    assert.equal(logged[1].code, error.code);
    assert.equal(logged[1].httpStatus, error.response?.status ?? null);
    assert.equal(logged[1].providerCode, error.response?.data?.ResponseCode ?? null);
    assert(!JSON.stringify(logged).match(/never-log|secret|ApiPassword/));
  }
  console.log('PASS: safe transport diagnostics retain original error and never log payloads or credentials.');
})().catch(error => { console.error(error); process.exitCode = 1; });
