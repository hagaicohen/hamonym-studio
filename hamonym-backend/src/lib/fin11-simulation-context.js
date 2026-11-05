"use strict";
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');
const context = new AsyncLocalStorage();
// Test phase is intrinsic to the provider boundary, never selected by clock or environment flags.
const fingerprint = createHash('sha256').update('hamonym:platform-fees:mock').digest('hex');
function configuration() { return { fingerprint }; }
function current() { return context.getStore(); }
function assertEntity(entityId) {
  const active = current();
  if (active && !active.entityIds.includes(entityId)) throw new Error('Billing account outside current execution');
}
function run(scope, fn) {
  if (!Number.isFinite(new Date(scope.businessAt).getTime()) || scope.fingerprint !== fingerprint || !Array.isArray(scope.entityIds)) throw new Error('Invalid billing execution context');
  return context.run(Object.freeze({ ...scope, entityIds: Object.freeze([...scope.entityIds]) }), fn);
}
module.exports = { configuration, current, assertEntity, run };
