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
jobRunner.register(require('./collection-attempt-reconciliation.job'));
jobRunner.register(require('./recurring-payment-reconciliation.job'));
jobRunner.register(require('./billing-monthly-cycle.job'));
jobRunner.register(require('./fin11-masav-prepare.job'));
jobRunner.register(require('./email-dispatch-recovery.job'));
jobRunner.register(require('./operational-alerting.job'));
jobRunner.register(require('./fx-snapshot-backfill.job'));

// Financial collection jobs stay manual-only and require explicit Super Admin authorization.
{ // Internal steps are always registered; only the shared monthly orchestrator schedules them.
  jobRunner.register({ ...require('./fin11-card-collection.job'), schedule: null, requiresExplicitCollection: true });
  jobRunner.register({ ...require('./fin11-card-retry-sweep.job'), schedule: null, requiresExplicitCollection: true });
}
module.exports = jobRunner;
