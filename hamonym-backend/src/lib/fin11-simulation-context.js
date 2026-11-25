"use strict";
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');
const context = new AsyncLocalStorage();
// Business-time and explicit execution context; never selects or simulates payment outcomes.
const fingerprint = createHash('sha256').update('hamonym:platform-fees:cardcom').digest('hex');
function configuration() { return { fingerprint }; }
function current() { return context.getStore(); }
function assertEntity(entityId) {
  const active = current();
  if (active?.entityIds && !active.entityIds.includes(entityId)) throw new Error('Billing account outside current execution');
}
function run(scope, fn) {
  if (!Number.isFinite(new Date(scope.businessAt).getTime()) || scope.fingerprint !== fingerprint || (scope.entityIds != null && !Array.isArray(scope.entityIds))) throw new Error('Invalid billing execution context');
  if (scope.collectionAuthorized === true && !scope.superAdminUserId) throw new Error('Explicit Super Admin collection authorization required');
  return context.run(Object.freeze({ ...scope, entityIds: scope.entityIds == null ? null : Object.freeze([...scope.entityIds]) }), fn);
}
module.exports = { configuration, current, assertEntity, run };
