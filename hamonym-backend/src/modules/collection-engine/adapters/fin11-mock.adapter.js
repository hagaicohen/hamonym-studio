// Test phase provider. Deterministic, no credentials, HTTP client or external access.
function result({ attemptId, entityId }) {
  if (!attemptId || !entityId) throw new Error('Attempt and entity required');
  return { outcome: 'succeeded', providerReference: 'fin11_mock:' + attemptId, providerRawStatus: 'simulated_success' };
}
module.exports = { provider: 'fin11_mock', NOT_IMPLEMENTED: false, charge: async args => result(args), reconcile: async args => result(args) };
