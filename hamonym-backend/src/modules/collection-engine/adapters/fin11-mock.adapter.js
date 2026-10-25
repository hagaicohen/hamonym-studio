// Simulation-only, deterministic provider. No HTTP client or card credentials.
const scope = require('../../../lib/fin11-simulation-context');
function result({ attemptId, entityId }) {
  if (!scope.current()) throw new Error('Simulation scope required');
  scope.configuration(); scope.assertEntity(entityId);
  if (!attemptId || !entityId) throw new Error('Scoped attempt required');
  return { outcome: 'succeeded', providerReference: 'fin11_mock:' + attemptId, providerRawStatus: 'simulated_success' };
}
module.exports = { NOT_IMPLEMENTED: false, charge: async args => result(args), reconcile: async args => result(args) };
