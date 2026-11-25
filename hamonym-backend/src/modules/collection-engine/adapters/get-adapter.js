const cardAdapter = require('./cardcom-token-charge.adapter');
const masavAdapter = require('./masav.adapter');

const ADAPTERS = {
  card: cardAdapter,
  masav: masavAdapter,
};

// Router's only entry point into "which provider handles this method" --
// see adapter.contract.js for the shape every entry must implement.
module.exports = function getAdapter(collectionMethod) {
  const adapter = ADAPTERS[collectionMethod];
  if (!adapter) {
    const err = new Error(`No collection adapter registered for method: ${collectionMethod}`);
    err.code = 'UNKNOWN_COLLECTION_METHOD';
    throw err;
  }
  return adapter;
};
