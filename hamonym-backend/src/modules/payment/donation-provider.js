// The donor rail uses a mock during test phase. Existing donor payments are never replayed.
require('./pilot-provider-boundary').install();
const provider = require('./mock-donation.provider');
module.exports = { getDonationProvider: () => provider };
