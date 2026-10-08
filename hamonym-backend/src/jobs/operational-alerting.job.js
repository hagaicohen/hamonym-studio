// Event B — pushes the "is the timing mechanism actually running" alerts
// (2026-10-07, Admin Notifications P0).
//
// WHY A JOB AND NOT THE HEALTH ENDPOINT: the same conditions are already
// computed live by GET /health (cardcom-ops.controller.js), but that is a
// read path — a dashboard refresh must never send an email, and it only
// helps when somebody happens to have the screen open. This job runs the
// EXACT same detection functions (ops-health.js, extracted from that
// controller rather than reimplemented) from a write path and turns each
// detected condition into one notification per incident.
//
// DETECT-ONLY: this job reads job_runs, writes nothing to any business
// table, and takes no corrective action. Its entire output is notifications
// plus its own result_summary.
//
// KNOWN LIMITATION, stated rather than engineered around: this job is itself
// triggered by the Render Cron Job (cron-entry.js). If that trigger stops
// completely, this job stops with it, so a total outage is reported when the
// trigger comes back (the incident key is the frozen last-heartbeat
// timestamp, so the alert still identifies the outage that happened, not
// "now") — not while it is ongoing. Detecting an ongoing total-trigger
// outage requires a watcher outside this process, which is a separate
// infrastructure decision and deliberately not invented here. Per-job
// staleness (scope 'job') is unaffected: the trigger is alive in that case by
// definition.
//
// Deliberately does NOT raise ops-health's computeAlerts() 'job_failed'
// condition: job-runner.js already notifies on exactly that, keyed on the
// job_runs id, at the moment the failure is recorded. Doing it here too
// would be a second email for one failure. Likewise 'critical_findings_open'
// is not raised here — each critical finding already notifies at the point it
// is recorded (events C/F/G).
const opsHealth = require('../modules/platform/cardcom-ops/ops-health');
const adminNotifications = require('../modules/email/admin-notification.service');

const TOLERANCE_MINUTES = opsHealth.HEARTBEAT_TOLERANCE_MS / 60_000;

module.exports = {
  name: 'operational-alerting',
  // Every 15 minutes — matches the Render Cron tick itself (cron-entry.js),
  // so a scheduler/job outage is reported at the first opportunity the
  // trigger gives us. Cost is a handful of job_runs reads; it calls no
  // external API at all.
  schedule: '*/15 * * * *',
  timeoutMs: 60 * 1000,
  handler: async (db) => {
    const now = new Date();

    const heartbeat = await opsHealth.getSchedulerHeartbeat(db, now);
    const schedulerAlerts = opsHealth.schedulerAlertsFor(heartbeat);
    const staleAlerts = await opsHealth.computeStaleAlerts(db, now);

    for (const alert of schedulerAlerts) {
      // Incident-start key, not a time bucket: lastHeartbeatAt is frozen for
      // the whole outage (it only moves when the trigger writes a new
      // heartbeat, which is also when the outage ends), so every evaluation
      // during one outage produces the same key and therefore one email.
      // 'never' covers the no-heartbeat-ever case — one alert, forever,
      // rather than one per run.
      const incidentStart = alert.lastHeartbeatAt
        ? new Date(alert.lastHeartbeatAt).toISOString()
        : 'never';
      adminNotifications.queueAdminNotification('scheduler_stale', {
        incidentKey: `SCHEDULER_HEARTBEAT_STALE:${incidentStart}`,
        data: {
          scope: 'scheduler',
          lastHeartbeatAt: alert.lastHeartbeatAt,
          minutesSinceLastHeartbeat: alert.minutesSinceLastHeartbeat,
          toleranceMinutes: TOLERANCE_MINUTES,
        },
      });
    }

    for (const alert of staleAlerts) {
      // Same reasoning per job: lastSuccessAt stays put until the job next
      // succeeds (which ends the incident), so it identifies the incident.
      // Its own name is excluded — a job reporting itself stale while it is
      // mid-run is noise, not a signal.
      if (alert.jobName === 'operational-alerting') continue;
      const incidentStart = alert.lastSuccessAt
        ? new Date(alert.lastSuccessAt).toISOString()
        : 'never';
      adminNotifications.queueAdminNotification('scheduler_stale', {
        incidentKey: `JOB_STALE:${alert.jobName}:${incidentStart}`,
        data: {
          scope: 'job',
          jobName: alert.jobName,
          lastSuccessAt: alert.lastSuccessAt,
          minutesSinceLastSuccess: alert.minutesSinceLastSuccess,
        },
      });
    }

    return {
      schedulerHealthy: heartbeat.healthy,
      minutesSinceLastHeartbeat: heartbeat.minutesSinceLastHeartbeat,
      schedulerAlerts: schedulerAlerts.length,
      staleJobAlerts: staleAlerts.filter((a) => a.jobName !== 'operational-alerting').length,
      staleJobNames: staleAlerts.map((a) => a.jobName).filter((n) => n !== 'operational-alerting'),
    };
  },
};
