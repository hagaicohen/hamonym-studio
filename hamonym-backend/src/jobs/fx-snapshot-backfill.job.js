// Completes paid USD/EUR donations whose representative-rate snapshot could
// not be taken at payment time (Bank of Israel unreachable): resolves the
// rate for each payment's own Israel date and adds the ILS equivalent to
// campaign progress -- see donations.service.js#resolvePendingFx.
//
// Scheduled only while foreign-currency donations are enabled
// (currency.config.js); with ILS only there is nothing that can be pending,
// so it stays manual-only and production scheduling is unchanged.
const { availability } = require('../modules/currency/currency.config');

module.exports = {
  name: 'fx-snapshot-backfill',
  schedule: availability().currencies.length > 1 ? '20 * * * *' : null,
  timeoutMs: 3 * 60 * 1000,
  handler: async () => require('../modules/donations/donations.service').resolvePendingFx({ limit: 100 }),
};
