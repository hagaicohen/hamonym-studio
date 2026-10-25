'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');
const context = new AsyncLocalStorage();
function reject(message) { throw Object.assign(new Error(message), { code: 'FIN11_SIMULATION_FORBIDDEN', status: 403 }); }
function enabled() { return process.env.HAMONYM_SIMULATION_MODE === 'on' && process.env.FIN11_SIMULATION_COLLECTION_ENABLED === 'true'; }
function configuration() {
  if (!enabled()) reject('FIN-11 simulation is disabled');
  const entityIds = (process.env.FIN11_SIMULATION_ENTITY_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!entityIds.length || entityIds.some(v => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))) reject('Explicit test entity UUID allowlist required');
  if (process.env.FIN11_SIMULATION_PAYMENT_PROVIDER !== 'mock') reject('Explicit mock payment provider required; CardCom is forbidden');
  const fingerprint = createHash('sha256').update('fin11_mock:' + [...new Set(entityIds)].sort().join(',')).digest('hex');
  return { entityIds: [...new Set(entityIds)], fingerprint };
}
function current() { return context.getStore(); }
function assertEntity(entityId) {
  const scope = current();
  if (!scope) return;
  const config = configuration();
  if (scope.fingerprint !== config.fingerprint || !config.entityIds.includes(entityId) || !scope.entityIds.includes(entityId)) reject('Entity outside simulation scope');
}
function run(scope, fn) {
  const config = configuration();
  if (!scope.entityIds?.length || scope.entityIds.some(id => !config.entityIds.includes(id)) || scope.fingerprint !== config.fingerprint) reject('Simulation scope or Sandbox identity changed');
  if (!Number.isFinite(new Date(scope.businessAt).getTime())) reject('Invalid business time');
  return context.run(Object.freeze({ ...scope, entityIds: Object.freeze([...scope.entityIds]) }), fn);
}
module.exports = { enabled, configuration, current, assertEntity, run };
