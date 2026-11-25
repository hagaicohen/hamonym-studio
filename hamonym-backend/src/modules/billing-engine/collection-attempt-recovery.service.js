// Compatibility entry delegates to the existing Cardcom verification job.
const pool = require('../../db/db');
async function recover() {
  return require('../../jobs/collection-attempt-reconciliation.job').reconcileStuckAttempts(pool, { now: await require('../../lib/clock').now(pool) });
}
module.exports = { recover };
