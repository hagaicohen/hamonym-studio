// Registers every known job with the runner. Importing this module has the
// side effect of populating the registry — call it once at process start
// (not yet done anywhere, see docs/CARDCOM_OPERATIONAL_PROCESSES.md Part F:
// wiring an actual periodic trigger is a separate, explicitly-reviewed
// step). Individual jobs remain callable directly via
// require('./job-runner').run('<name>') without this, for scripts/tests.
const jobRunner = require('./job-runner');

jobRunner.register(require('./webhook-recovery.job'));
jobRunner.register(require('./stale-pending-donations.job'));
jobRunner.register(require('./aggregate-consistency.job'));
jobRunner.register(require('./stuck-recurring-signups.job'));
jobRunner.register(require('./billing-approval-consistency.job'));
jobRunner.register(require('./billing-provisioning-gap.job'));

module.exports = jobRunner;
