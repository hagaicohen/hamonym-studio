module.exports = {
  receipt: require('./receipt'),
  'reset-password': require('./reset-password'),
  'invite-admin': require('./invite-admin'),
  'entity-flagged-for-review': require('./entity-flagged-for-review'),
  'invite-partner-editor': require('./invite-partner-editor'),
  'billing-setup-required': require('./billing-setup-required'),
  'entity-approved': require('./entity-approved'),
  'entity-rejected': require('./entity-rejected'),
  'recurring-payment-failed': require('./recurring-payment-failed'),

  // Operational (Super-Admin-facing) alerts — see _admin-alert.js for the
  // shared renderer and the content rule. Routed exclusively through
  // admin-notification.service.js's EVENT_POLICY, never queued ad hoc.
  'admin-job-failed': require('./admin-job-failed'),
  'admin-scheduler-stale': require('./admin-scheduler-stale'),
  'admin-operational-finding': require('./admin-operational-finding'),
  'admin-webhook-unresolved': require('./admin-webhook-unresolved'),
  'admin-entity-hard-deleted': require('./admin-entity-hard-deleted'),
};
