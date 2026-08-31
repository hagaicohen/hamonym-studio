// Test for WP6 (Donation Engine closure, 2026-08-31): the recurring
// webhook's shared Secret must never reach idempotency hashing/storage or
// downstream handlers -- only the validator sees the real value. Fully
// mocked (validator/idempotency/dispatcher), no real DB, no real network.
//
// Run: node scripts/test-webhook-secret-redaction.js

const assert = require('assert');

let passed = 0;
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log('      ', err.stack || err.message);
  }
}

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

// Pre-seeds the webhook.dispatcher cache entry with a fake BEFORE
// payment.controller.js is (re-)required -- payment.controller.js does
// `const webhookDispatcher = require('./webhook.dispatcher')`, a plain
// function export, so mutating the cache AFTER that const is already bound
// has no effect (unlike an object export, there's no property to patch
// post-hoc).
function freshController(fakeDispatcher) {
  for (const relPath of [
    'payment.controller',
    'cardcom/cardcom.validator',
    'idempotency/idempotency.service',
    'audit/audit.service',
    'webhook.dispatcher',
  ]) {
    const id = require.resolve('../src/modules/payment/' + relPath);
    delete require.cache[id];
  }

  const dispatcherId = require.resolve('../src/modules/payment/webhook.dispatcher');
  require.cache[dispatcherId] = { id: dispatcherId, filename: dispatcherId, loaded: true, exports: fakeDispatcher };

  return require('../src/modules/payment/payment.controller');
}

async function run() {
  await check('Secret is validated with the real value, but never reaches idempotency.claim or the dispatcher', async () => {
    let dispatcherPayload = null;
    const controller = freshController(async (payload) => { dispatcherPayload = payload; });

    const validator = require('../src/modules/payment/cardcom/cardcom.validator');
    const idempotencyService = require('../src/modules/payment/idempotency/idempotency.service');
    const auditService = require('../src/modules/payment/audit/audit.service');

    let validatorSawSecret = null;
    validator.validateRecurringWebhookSecret = (body) => { validatorSawSecret = body.Secret; return true; };

    let claimPayload = null;
    idempotencyService.claim = async ({ payload }) => { claimPayload = payload; return { isNew: true, eventId: 'evt-1' }; };

    auditService.recordProcessed = async () => {};

    const req = { body: { Secret: 'super-secret-value', RecurringId: 123, Status: 'SUCCESSFUL', Sum: '100' } };
    const res = fakeRes();
    await controller.handleRecurringWebhook(req, res);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(validatorSawSecret, 'super-secret-value', 'the validator must see the real secret to actually check it');
    assert.ok(claimPayload, 'claim must have been called');
    assert.ok(!('Secret' in claimPayload), 'Secret must be stripped before idempotency hashing/storage');
    assert.ok(dispatcherPayload, 'dispatcher must have been called');
    assert.ok(!('Secret' in dispatcherPayload), 'Secret must be stripped before reaching downstream handlers');
    assert.strictEqual(dispatcherPayload.RecurringId, 123, 'other business fields must still be intact');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
