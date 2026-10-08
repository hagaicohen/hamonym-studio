// Real-DB proof of the Admin/Ops Notifications P0 slice (2026-10-07):
//   * the SUPER_ADMIN recipient is resolved from the authoritative source
//     (users.is_super_admin AND is_active), and nothing else is
//   * every one of the 8 P0 events maps to a registered template, with an
//     explicit policy row
//   * idempotency is deterministic, and a repeated event (job re-run,
//     redelivered webhook, repeated health evaluation) sends nothing extra
//   * a notification failure never affects the underlying business/job flow
//   * nothing is notified before its own evidence is durably persisted
//   * the local EMAIL_DEV_PREVIEW stub preview path works
//   * no admin email can carry donor PII or CardCom credentials
//   * the read-only ops controller contains no notification call at all
//   * the three frozen reconciliation jobs' schedules are untouched
//
// EMAIL_ENABLED/EMAIL_PROVIDER are overridden only in THIS process's env
// (never written to .env, never anywhere near Render), and the "real
// provider" used below is the resend provider module with its send() swapped
// in memory — so no network call is ever made and no real inbox is ever
// touched. Same convention as scripts/test-pilot-p0-emails.js.
//
// Run: node scripts/test-admin-ops-notifications.js

require('dotenv').config({ quiet: true });
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');
const templates = require('../src/modules/email/templates');
const adminNotifications = require('../src/modules/email/admin-notification.service');
const { recordFinding } = require('../src/jobs/reconciliation-findings');
const jobRunner = require('../src/jobs');
const platformService = require('../src/modules/platform/platform.service');
const masterRecurringHandler = require('../src/modules/payment/handlers/master-recurring.handler');

// In-memory provider swap — email.service.js#getProvider does a plain
// require() per dispatch, so it always gets this same cached module object.
// The REAL resend send() is never reachable from this process once this line
// has run, and it is restored in the finally block.
const resendProvider = require('../src/modules/email/providers/resend.provider');
const realResendSend = resendProvider.send;
let fakeProviderMode = 'ok'; // 'ok' | 'throw'
let fakeProviderCalls = 0;
resendProvider.send = async () => {
  fakeProviderCalls++;
  if (fakeProviderMode === 'throw') throw new Error('simulated provider failure');
  return { providerMessageId: `fake-${Date.now()}-${fakeProviderCalls}`, stub: false };
};

const PREVIEW_DIR = path.join(__dirname, '..', 'tmp', 'email-previews');

let failures = 0;
let passed = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const RUN_TAG = `zzz-admin-notif-${Date.now()}`;
const RUN_STARTED_AT = new Date();
const SA_EMAIL = `${RUN_TAG}-sa@example.invalid`;
const SA_INACTIVE_EMAIL = `${RUN_TAG}-sa-inactive@example.invalid`;
const PLAIN_EMAIL = `${RUN_TAG}-plain@example.invalid`;
const DONOR_EMAIL = `${RUN_TAG}-donor@example.invalid`;

const ids = {
  superAdminUserId: null, inactiveSuperAdminUserId: null, plainUserId: null,
  entityId: null, campaignId: null, instructionId: null, cardcomRecurringId: null,
  deletableEntityId: null,
};
const usedIncidentKeys = [];
const usedFindingSubjects = [];

function setEmailEnv(enabled, provider) {
  process.env.EMAIL_ENABLED = enabled;
  process.env.EMAIL_PROVIDER = provider;
}

async function logsForKeyPrefix(incidentKey) {
  usedIncidentKeys.push(incidentKey);
  const res = await pool.query(
    `SELECT id, template, status, to_email, subject, idempotency_key, payload, entity_id, donation_id
     FROM email_logs WHERE idempotency_key LIKE $1 ORDER BY id ASC`,
    [`${incidentKey}:%`]
  );
  return res.rows;
}

// queueAdminNotification is setImmediate-based fire-and-forget, so a caller
// returning does not mean the row exists yet. Poll rather than guess a sleep.
// The timeout is generous on purpose: one dispatch is (recipients x several
// round trips) against a remote pooler, and these assertions are about
// correctness, not latency.
// `status='pending'` means the key is claimed but the provider call has not
// finished yet (email.service.js's claim-before-send); waiting for a terminal
// status matters whenever a test asserts on the OUTCOME rather than just on
// existence.
async function waitForKeyPrefix(incidentKey, expectedCount, { timeoutMs = 45000, terminal = false } = {}) {
  usedIncidentKeys.push(incidentKey);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await pool.query(
      `SELECT id, template, status, to_email, subject, idempotency_key, payload, entity_id, donation_id
       FROM email_logs WHERE idempotency_key LIKE $1 ORDER BY id ASC`,
      [`${incidentKey}:%`]
    );
    const settled = !terminal || res.rows.every((r) => r.status !== 'pending');
    if ((res.rows.length >= expectedCount && settled) || Date.now() > deadline) return res.rows;
    await new Promise((r) => setTimeout(r, 150));
  }
}

// Waits until a count stops moving — the only honest way to snapshot "how
// many emails exist" while fire-and-forget dispatches from a previous step
// may still be landing. Not a fixed sleep: it polls until two consecutive
// readings agree.
async function waitUntilQuiet(sql, params = [], timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let previous = null;
  for (;;) {
    const res = await pool.query(sql, params);
    const current = res.rows[0].n;
    if (previous !== null && current === previous) return current;
    previous = current;
    if (Date.now() > deadline) return current;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function setup() {
  const sa = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, is_super_admin)
     VALUES (1, $1, 'ZZZ Admin Notif SuperAdmin', true, true) RETURNING id`,
    [SA_EMAIL]
  );
  ids.superAdminUserId = sa.rows[0].id;

  const inactive = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, is_super_admin)
     VALUES (1, $1, 'ZZZ Admin Notif Inactive SuperAdmin', false, true) RETURNING id`,
    [SA_INACTIVE_EMAIL]
  );
  ids.inactiveSuperAdminUserId = inactive.rows[0].id;

  const plain = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, is_super_admin)
     VALUES (1, $1, 'ZZZ Admin Notif Plain User', true, false) RETURNING id`,
    [PLAIN_EMAIL]
  );
  ids.plainUserId = plain.rows[0].id;

  const entity = await pool.query(
    `INSERT INTO entities (display_name, status, entity_type, created_by_user_id)
     VALUES ($1, 'active', 'association', $2) RETURNING id`,
    ['ZZZ_TEST_ADMIN_NOTIF_DO_NOT_USE', ids.superAdminUserId]
  );
  ids.entityId = entity.rows[0].id;

  const campaign = await pool.query(
    `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1, $2, $3, 'draft') RETURNING id`,
    [ids.entityId, `${RUN_TAG}-campaign`, 'ZZZ קמפיין בדיקת התראות']
  );
  ids.campaignId = campaign.rows[0].id;

  // Negative cardcom_recurring_id can never collide with a real CardCom id.
  const instruction = await pool.query(
    `INSERT INTO recurring_instructions (entity_id, campaign_id, donor_name, donor_email, donor_phone, amount, status, cardcom_recurring_id)
     VALUES ($1,$2,'ZZZ תורם בדיקה',$3,'0500000000',36,'active',$4) RETURNING id, cardcom_recurring_id`,
    [ids.entityId, ids.campaignId, DONOR_EMAIL, -1 * (Date.now() % 2000000000)]
  );
  ids.instructionId = instruction.rows[0].id;
  ids.cardcomRecurringId = instruction.rows[0].cardcom_recurring_id;

  // A second, empty entity used only to exercise the real hardDeleteEntity
  // path (event H). Nothing is attached to it, so its permanent erasure
  // destroys no fixture data and no real data.
  const deletable = await pool.query(
    `INSERT INTO entities (display_name, status, entity_type, created_by_user_id)
     VALUES ($1, 'rejected', 'association', $2) RETURNING id`,
    ['ZZZ_TEST_ADMIN_NOTIF_HARD_DELETE_ME', ids.superAdminUserId]
  );
  ids.deletableEntityId = deletable.rows[0].id;

  // How many emails ONE incident is expected to produce (this fixture's
  // super admin plus whatever real active super admins the DB has) — every
  // "exactly once" assertion counts against this, not against 1.
  ids.recipientCount = (await adminNotifications.resolveSuperAdminRecipients()).length;
}

async function cleanup() {
  for (const key of [...new Set(usedIncidentKeys)]) {
    await pool.query(`DELETE FROM email_logs WHERE idempotency_key LIKE $1`, [`${key}:%`]);
  }
  await pool.query(`DELETE FROM email_logs WHERE to_email IN ($1,$2,$3,$4)`, [SA_EMAIL, SA_INACTIVE_EMAIL, PLAIN_EMAIL, DONOR_EMAIL]);
  for (const subjectId of [...new Set(usedFindingSubjects)]) {
    await pool.query(`DELETE FROM reconciliation_findings WHERE subject_id = $1`, [subjectId]);
  }
  await pool.query(`DELETE FROM job_runs WHERE triggered_by = $1`, [RUN_TAG]);

  // The alerting job's own incident keys (SCHEDULER_HEARTBEAT_STALE / JOB_STALE)
  // are the REAL production keys for whatever outage is open right now — they
  // carry no fixture marker, so they are scoped by time instead: only rows
  // created during THIS run are removed. Leaving a test-consumed key behind
  // would permanently suppress the first real alert for that same incident
  // (email.service.js never retries a consumed key); deleting rows older than
  // this run would corrupt dedup state the test did not create.
  await pool.query(
    `DELETE FROM email_logs
     WHERE created_at >= $1
       AND (idempotency_key LIKE 'SCHEDULER_HEARTBEAT_STALE:%' OR idempotency_key LIKE 'JOB_STALE:%')`,
    [RUN_STARTED_AT]
  );

  if (ids.entityId) {
    const stuck = await pool.query(`SELECT count(*)::int n FROM donations WHERE entity_id = $1 AND status = 'paid'`, [ids.entityId]);
    if (stuck.rows[0].n > 0) {
      console.error(`CLEANUP WARNING: ${stuck.rows[0].n} paid donation(s) exist for the fixture entity and are undeletable by design (migration 055). Entity ${ids.entityId} left behind — investigate, do not disable the trigger.`);
    } else {
      await pool.query(`DELETE FROM donations WHERE entity_id = $1`, [ids.entityId]);
      await pool.query(`DELETE FROM recurring_instructions WHERE entity_id = $1`, [ids.entityId]);
      await pool.query(`DELETE FROM campaigns WHERE entity_id = $1`, [ids.entityId]);
      await pool.query(`DELETE FROM email_logs WHERE entity_id = $1`, [ids.entityId]);
      await pool.query(`UPDATE platform_audit_log SET entity_id = NULL WHERE entity_id = $1`, [ids.entityId]);
      await pool.query(`DELETE FROM entities WHERE id = $1`, [ids.entityId]);
    }
  }
  if (ids.deletableEntityId) {
    await pool.query(`UPDATE platform_audit_log SET entity_id = NULL WHERE entity_id = $1`, [ids.deletableEntityId]);
    await pool.query(`DELETE FROM entities WHERE id = $1`, [ids.deletableEntityId]);
  }
  // The hard_delete audit row is deliberately NOT removed by entity id (it
  // has none, by design) — removed by this run's own synthetic marker only.
  await pool.query(`DELETE FROM platform_audit_log WHERE action = 'hard_delete' AND notes LIKE '%ZZZ_TEST_ADMIN_NOTIF_HARD_DELETE_ME%'`);
  await pool.query(`DELETE FROM platform_audit_log WHERE super_admin_user_id = ANY($1::bigint[])`, [[ids.superAdminUserId, ids.inactiveSuperAdminUserId, ids.plainUserId].filter(Boolean)]);
  for (const userId of [ids.superAdminUserId, ids.inactiveSuperAdminUserId, ids.plainUserId]) {
    if (userId) await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
}

async function main() {
  const originalEnabled = process.env.EMAIL_ENABLED;
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalPreview = process.env.EMAIL_DEV_PREVIEW;

  await setup();
  try {
    /* ---------- 1. recipient resolution ---------- */

    await check('recipient resolution: SUPER_ADMIN comes from users.is_super_admin AND is_active — an inactive super admin and an ordinary active user are both excluded', async () => {
      const recipients = await adminNotifications.resolveSuperAdminRecipients();
      const emails = recipients.map((r) => r.email);
      assert.ok(emails.includes(SA_EMAIL), 'the active super admin must be resolved');
      assert.ok(!emails.includes(SA_INACTIVE_EMAIL), 'an inactive super admin must never be notified');
      assert.ok(!emails.includes(PLAIN_EMAIL), 'a non-super-admin must never be notified');
      assert.ok(recipients.every((r) => r.email && r.id != null), 'every recipient carries an id and an address');
    });

    /* ---------- 2. policy / event -> template mapping ---------- */

    await check('policy: exactly the 8 P0 events, each enabled, immediate, SUPER_ADMIN, with a registered template', async () => {
      const expected = [
        'job_run_failed',
        'scheduler_stale',
        'gate_v1_mismatch',
        'pending_donation_missing_low_profile_id',
        'webhook_recovery_unresolved',
        'stuck_recurring_signup',
        'recurring_unexplained_inactive',
        'entity_hard_deleted',
      ];
      assert.deepStrictEqual(Object.keys(adminNotifications.EVENT_POLICY).sort(), [...expected].sort());
      for (const [eventType, policy] of Object.entries(adminNotifications.EVENT_POLICY)) {
        assert.strictEqual(policy.enabled, true, `${eventType} must be enabled`);
        assert.strictEqual(policy.recipientRole, 'SUPER_ADMIN', `${eventType} recipientRole`);
        assert.strictEqual(policy.deliveryMode, 'immediate', `${eventType} deliveryMode`);
        assert.ok(['critical', 'warning', 'info', 'administrative'].includes(policy.severity), `${eventType} severity`);
        assert.ok(typeof templates[policy.template] === 'function', `${eventType} -> template ${policy.template} must be registered`);
      }
    });

    await check('policy: an unknown event type is refused, not improvised into an email', async () => {
      setEmailEnv('true', 'stub');
      const before = fakeProviderCalls;
      const result = await adminNotifications.sendAdminNotification('zzz_not_a_real_event', {
        incidentKey: 'ZZZ_UNKNOWN', data: {},
      });
      assert.strictEqual(result.status, 'unknown_event');
      assert.strictEqual(fakeProviderCalls, before);
    });

    await check('policy: a notification without an incidentKey is refused — an unkeyed ops alert is exactly the spam mode this slice prevents', async () => {
      setEmailEnv('true', 'stub');
      const result = await adminNotifications.sendAdminNotification('job_run_failed', { data: { jobName: 'zzz' } });
      assert.strictEqual(result.status, 'missing_incident_key');
    });

    /* ---------- 3. deterministic idempotency ---------- */

    await check('idempotency: the same incidentKey dispatched twice produces exactly one email per recipient', async () => {
      setEmailEnv('true', 'stub');
      const incidentKey = `JOB_RUN_FAILED:${RUN_TAG}-idem`;
      const first = await adminNotifications.sendAdminNotification('job_run_failed', {
        incidentKey,
        data: { jobName: 'zzz-job', jobRunId: 1, failedAt: new Date().toISOString(), error: 'ZZZ synthetic' },
      });
      assert.strictEqual(first.status, 'dispatched');
      assert.ok(first.results.every((r) => r.status === 'stub'), 'first dispatch reaches the stub provider');

      const before = fakeProviderCalls;
      const second = await adminNotifications.sendAdminNotification('job_run_failed', {
        incidentKey,
        data: { jobName: 'zzz-job', jobRunId: 1, failedAt: new Date().toISOString(), error: 'ZZZ synthetic' },
      });
      assert.ok(second.results.every((r) => r.status === 'duplicate'), 'the repeat is suppressed for every recipient');
      assert.strictEqual(fakeProviderCalls, before, 'and never reaches any provider');

      const rows = await logsForKeyPrefix(incidentKey);
      const perRecipient = new Map();
      for (const row of rows) perRecipient.set(row.idempotency_key, (perRecipient.get(row.idempotency_key) || 0) + 1);
      assert.ok([...perRecipient.values()].every((n) => n === 1), 'exactly one email_logs row may own each per-recipient key');
      assert.strictEqual(rows.length, first.recipients, 'one row per resolved recipient, no more');
    });

    await check('idempotency: the key is derived from the incident, not from the clock — two evaluations seconds apart collide', async () => {
      setEmailEnv('true', 'stub');
      const incidentKey = `SCHEDULER_HEARTBEAT_STALE:${RUN_TAG}-2026-10-07T00:00:00.000Z`;
      await adminNotifications.sendAdminNotification('scheduler_stale', {
        incidentKey, data: { scope: 'scheduler', minutesSinceLastHeartbeat: 735, toleranceMinutes: 30 },
      });
      const second = await adminNotifications.sendAdminNotification('scheduler_stale', {
        incidentKey, data: { scope: 'scheduler', minutesSinceLastHeartbeat: 736, toleranceMinutes: 30 },
      });
      assert.ok(second.results.every((r) => r.status === 'duplicate'));
      const rows = await logsForKeyPrefix(incidentKey);
      assert.strictEqual(rows.length, second.recipients);
    });

    /* ---------- 4. a repeated real event does not duplicate the email ---------- */

    await check('repeated detection: recordFinding upserts into the SAME open finding row, so a job re-run yields the same id and therefore one email', async () => {
      setEmailEnv('true', 'stub');
      // Synthetic subject uuid — reconciliation_findings.subject_id carries no
      // FK, so this references nothing real and cleans up by itself.
      const subjectId = '00000000-0000-0000-0000-0000000f0001';
      usedFindingSubjects.push(subjectId);

      const first = await recordFinding(pool, {
        jobName: `${RUN_TAG}-job`, findingType: 'stuck_recurring_signup', severity: 'critical',
        subjectType: 'recurring_instruction', subjectId, details: { instructionStatus: 'pending_creation' },
      });
      const second = await recordFinding(pool, {
        jobName: `${RUN_TAG}-job`, findingType: 'stuck_recurring_signup', severity: 'critical',
        subjectType: 'recurring_instruction', subjectId, details: { instructionStatus: 'pending_creation' },
      });
      assert.ok(first.id, 'recordFinding returns the finding id');
      assert.strictEqual(second.id, first.id, 'a re-detection of an open finding is the SAME row');
      assert.strictEqual(first.isNew, true);
      assert.strictEqual(second.isNew, false);

      const incidentKey = `FINDING:stuck_recurring_signup:${first.id}`;
      const a = await adminNotifications.sendAdminNotification('stuck_recurring_signup', {
        incidentKey, data: { findingId: first.id, findingType: 'stuck_recurring_signup', subjectType: 'recurring_instruction', subjectId },
      });
      const b = await adminNotifications.sendAdminNotification('stuck_recurring_signup', {
        incidentKey: `FINDING:stuck_recurring_signup:${second.id}`,
        data: { findingId: second.id, findingType: 'stuck_recurring_signup', subjectType: 'recurring_instruction', subjectId },
      });
      assert.ok(b.results.every((r) => r.status === 'duplicate'), 'the second job run emails nothing');
      const rows = await logsForKeyPrefix(incidentKey);
      assert.strictEqual(rows.length, a.recipients);
    });

    /* ---------- 5. event G: new persistence + notification, end to end ---------- */

    await check('event G: an unexplained CardCom deactivation records a NEW finding type and notifies off it', async () => {
      setEmailEnv('true', 'stub');
      usedFindingSubjects.push(ids.instructionId);

      await masterRecurringHandler.handle({
        RecordType: 'MasterRecurring',
        RecurringId: ids.cardcomRecurringId,
        IsActive: 'false',
      });

      const instruction = await pool.query(`SELECT status FROM recurring_instructions WHERE id = $1`, [ids.instructionId]);
      assert.strictEqual(instruction.rows[0].status, 'inactive', 'the status update itself is unchanged behavior');

      const finding = await pool.query(
        `SELECT id, finding_type, severity, job_name, details FROM reconciliation_findings
         WHERE subject_id = $1 AND finding_type = 'recurring_unexplained_inactive' AND resolved_at IS NULL`,
        [ids.instructionId]
      );
      assert.strictEqual(finding.rows.length, 1, 'exactly one open finding for the observed deactivation');
      assert.strictEqual(finding.rows[0].severity, 'warning');
      assert.strictEqual(finding.rows[0].job_name, 'master_recurring_webhook');
      assert.strictEqual(finding.rows[0].details.previousStatus, 'active');

      const rows = await waitForKeyPrefix(`FINDING:recurring_unexplained_inactive:${finding.rows[0].id}`, ids.recipientCount);
      assert.strictEqual(rows.length, ids.recipientCount, 'one notification per resolved super admin, queued off the committed finding');
      assert.strictEqual(rows[0].template, 'admin-operational-finding');
      assert.ok(rows[0].subject.includes('הוראת קבע הפכה ללא פעילה'));
    });

    await check('event G: a repeated MasterRecurring webhook for an already-inactive instruction records nothing and emails nothing', async () => {
      setEmailEnv('true', 'stub');
      const LOGS_SQL = `SELECT count(*)::int n FROM email_logs WHERE idempotency_key LIKE 'FINDING:recurring_unexplained_inactive:%'`;
      const findingsBefore = await pool.query(`SELECT count(*)::int n FROM reconciliation_findings WHERE subject_id = $1`, [ids.instructionId]);
      const logsBefore = await waitUntilQuiet(LOGS_SQL);

      await masterRecurringHandler.handle({
        RecordType: 'MasterRecurring', RecurringId: ids.cardcomRecurringId, IsActive: 'false',
      });

      const findingsAfter = await pool.query(`SELECT count(*)::int n FROM reconciliation_findings WHERE subject_id = $1`, [ids.instructionId]);
      const logsAfter = await waitUntilQuiet(LOGS_SQL);
      assert.strictEqual(findingsAfter.rows[0].n, findingsBefore.rows[0].n, 'no second finding for the same deactivation');
      assert.strictEqual(logsAfter, logsBefore, 'no second email');
    });

    await check('event G: a provider failure does not stop the recurring status update (observability only)', async () => {
      setEmailEnv('true', 'resend');
      fakeProviderMode = 'throw';
      await pool.query(`UPDATE recurring_instructions SET status = 'active' WHERE id = $1`, [ids.instructionId]);
      await pool.query(`DELETE FROM reconciliation_findings WHERE subject_id = $1`, [ids.instructionId]);

      await masterRecurringHandler.handle({
        RecordType: 'MasterRecurring', RecurringId: ids.cardcomRecurringId, IsActive: 'false',
      });

      const instruction = await pool.query(`SELECT status FROM recurring_instructions WHERE id = $1`, [ids.instructionId]);
      assert.strictEqual(instruction.rows[0].status, 'inactive', 'the webhook outcome is unaffected by the email blowing up');
      const finding = await pool.query(
        `SELECT id FROM reconciliation_findings WHERE subject_id = $1 AND finding_type = 'recurring_unexplained_inactive'`,
        [ids.instructionId]
      );
      assert.strictEqual(finding.rows.length, 1, 'the finding is persisted regardless of the email outcome');
      const rows = await waitForKeyPrefix(`FINDING:recurring_unexplained_inactive:${finding.rows[0].id}`, ids.recipientCount, { terminal: true });
      assert.strictEqual(rows.length, ids.recipientCount);
      assert.ok(rows.every((r) => r.status === 'failed'), `the provider error lands in email_logs only (got ${rows.map((r) => r.status).join(',')})`);
      fakeProviderMode = 'ok';
    });

    /* ---------- 6. event A: job failure, from the job_runs write path ---------- */

    await check('event A: a failing job notifies AFTER job_runs is marked failed, keyed on the run id, and the job result is unchanged', async () => {
      setEmailEnv('true', 'stub');
      const jobName = `${RUN_TAG}-failing-job`;
      jobRunner.register({
        name: jobName,
        handler: async () => { throw new Error('ZZZ synthetic job failure'); },
      });

      const run = await jobRunner.run(jobName, { triggeredBy: RUN_TAG });
      assert.strictEqual(run.status, 'failed', 'the job runner still reports the failure to its caller');
      assert.match(run.error, /ZZZ synthetic job failure/);

      const jobRow = await pool.query(`SELECT status, error FROM job_runs WHERE id = $1`, [run.runId]);
      assert.strictEqual(jobRow.rows[0].status, 'failed', 'the durable evidence exists');

      const rows = await waitForKeyPrefix(`JOB_RUN_FAILED:${run.runId}`, ids.recipientCount);
      assert.strictEqual(rows.length, ids.recipientCount);
      assert.strictEqual(rows[0].template, 'admin-job-failed');
      assert.ok(rows[0].payload.data.jobRunId === run.runId);
      assert.ok(rows[0].subject.includes('משימת מערכת נכשלה'));
    });

    await check('event A: a provider failure never changes the job outcome', async () => {
      setEmailEnv('true', 'resend');
      fakeProviderMode = 'throw';
      const jobName = `${RUN_TAG}-failing-job-2`;
      jobRunner.register({ name: jobName, handler: async () => { throw new Error('ZZZ synthetic job failure 2'); } });
      const run = await jobRunner.run(jobName, { triggeredBy: RUN_TAG });
      assert.strictEqual(run.status, 'failed');
      const rows = await waitForKeyPrefix(`JOB_RUN_FAILED:${run.runId}`, ids.recipientCount, { terminal: true });
      assert.ok(rows.every((r) => r.status === 'failed'), `only email_logs records the email failure (got ${rows.map((r) => r.status).join(',')})`);
      fakeProviderMode = 'ok';
    });

    await check('event A: a job that SUCCEEDS notifies nothing', async () => {
      setEmailEnv('true', 'stub');
      const jobName = `${RUN_TAG}-ok-job`;
      jobRunner.register({ name: jobName, handler: async () => ({ ok: true }) });
      const run = await jobRunner.run(jobName, { triggeredBy: RUN_TAG });
      assert.strictEqual(run.status, 'success');
      await new Promise((r) => setTimeout(r, 400));
      const rows = await logsForKeyPrefix(`JOB_RUN_FAILED:${run.runId}`);
      assert.strictEqual(rows.length, 0);
    });

    /* ---------- 7. event B: the alerting job reuses the dashboard's detection ---------- */

    await check('event B: operational-alerting is registered, detect-only, and reuses the SAME ops-health detection the read-only health endpoint uses', async () => {
      const job = jobRunner.get('operational-alerting');
      assert.ok(job, 'registered in src/jobs/index.js');
      assert.strictEqual(job.schedule, '*/15 * * * *');

      const opsHealth = require('../src/modules/platform/cardcom-ops/ops-health');
      const controller = require('../src/modules/platform/cardcom-ops/cardcom-ops.controller');
      assert.strictEqual(controller.computeAlerts, opsHealth.computeAlerts, 'the controller delegates to the same function, it does not keep a copy');
      assert.strictEqual(controller.getSchedulerHeartbeat, opsHealth.getSchedulerHeartbeat);

      // Fake db: an ancient heartbeat and an ancient per-job last success, so
      // both scopes fire without touching the real job_runs table.
      const now = new Date('2026-10-07T12:00:00Z');
      const ancient = new Date(now.getTime() - 10 * 24 * 60 * 60_000).toISOString();
      const fakeDb = { query: async () => ({ rows: [{ last_heartbeat_at: ancient, last_success: ancient }] }) };

      const heartbeat = await opsHealth.getSchedulerHeartbeat(fakeDb, now);
      assert.strictEqual(heartbeat.healthy, false);
      assert.strictEqual(opsHealth.schedulerAlertsFor(heartbeat).length, 1);

      const stale = await opsHealth.computeStaleAlerts(fakeDb, now);
      assert.ok(stale.length > 0, 'per-job staleness still detected from a job/write-path context');
      assert.ok(stale.every((a) => a.lastSuccessAt), 'each stale alert carries the frozen incident-start timestamp used as its idempotency key');
      assert.ok(!stale.some((a) => a.jobName === 'recurring-payment-reconciliation'), 'a schedule-less (frozen) job is never flagged');
    });

    await check('event B: the alerting job runs, writes no business state, and dedupes an ongoing outage by the frozen last-heartbeat timestamp', async () => {
      setEmailEnv('true', 'stub');
      const findingsBefore = await pool.query(`SELECT count(*)::int n FROM reconciliation_findings`);
      const run = await jobRunner.run('operational-alerting', { triggeredBy: RUN_TAG });
      assert.strictEqual(run.status, 'success', run.error || '');
      assert.ok('schedulerHealthy' in run.result);
      const findingsAfter = await pool.query(`SELECT count(*)::int n FROM reconciliation_findings`);
      assert.strictEqual(findingsAfter.rows[0].n, findingsBefore.rows[0].n, 'detect-only: the alerting job writes no findings');

      // Second run in the same incident must address the SAME incidents, so
      // the SET of incident keys must not grow. Deliberately set-based and
      // not count-based: a fire-and-forget row from the first run can still
      // be landing while the second run executes, which makes a row COUNT
      // comparison a race. A set comparison is immune to that — a late row
      // from run 1 carries a key that run 2 would also have produced, so it
      // cannot change the set unless the keys really are unstable (which is
      // exactly the regression being guarded against).
      await new Promise((r) => setTimeout(r, 3000));
      const incidentKeySet = async () => {
        const res = await pool.query(
          `SELECT DISTINCT regexp_replace(idempotency_key, ':[0-9]+$', '') AS incident
           FROM email_logs
           WHERE idempotency_key LIKE 'SCHEDULER_HEARTBEAT_STALE:%' OR idempotency_key LIKE 'JOB_STALE:%'`
        );
        return res.rows.map((r) => r.incident).sort();
      };
      const keysBefore = await incidentKeySet();
      const run2 = await jobRunner.run('operational-alerting', { triggeredBy: RUN_TAG });
      assert.strictEqual(run2.status, 'success', run2.error || '');
      assert.deepStrictEqual(run2.result.staleJobNames, run.result.staleJobNames, 'both runs see the same incidents');
      await new Promise((r) => setTimeout(r, 4000));
      const keysAfter = await incidentKeySet();
      assert.deepStrictEqual(keysAfter, keysBefore, 'a repeated health evaluation of the same ongoing incident produces no NEW incident key');

      // This test ran the REAL alerting job against the real DB, so the keys
      // it consumed are the genuine production keys for whatever incident is
      // open right now. cleanup() removes exactly the rows created during
      // this run (see its own comment) so the test neither leaves a
      // test-consumed key suppressing a future real alert, nor touches dedup
      // state it did not create.
    });

    /* ---------- 8. event H: hard delete, only after commit ---------- */

    await check('event H: a FAILED hard delete (entity not found) commits nothing and notifies nothing', async () => {
      setEmailEnv('true', 'stub');
      const ghostId = '00000000-0000-0000-0000-000000009999';
      await assert.rejects(
        platformService.hardDeleteEntity(ghostId, ids.superAdminUserId, 'ZZZ should not happen', '127.0.0.1'),
        /Entity not found/
      );
      await new Promise((r) => setTimeout(r, 400));
      const rows = await pool.query(
        `SELECT count(*)::int n FROM email_logs WHERE idempotency_key LIKE $1`,
        [`ENTITY_HARD_DELETE:${ghostId}:%`]
      );
      assert.strictEqual(rows.rows[0].n, 0, 'nothing may be notified for a transaction that rolled back');
    });

    await check('event H: a real hard delete notifies only after COMMIT, keyed on the committed platform_audit_log row', async () => {
      setEmailEnv('true', 'stub');
      const targetId = ids.deletableEntityId;
      const result = await platformService.hardDeleteEntity(targetId, ids.superAdminUserId, 'ZZZ synthetic hard delete', '127.0.0.1');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.entityName, 'ZZZ_TEST_ADMIN_NOTIF_HARD_DELETE_ME', 'the pre-existing return contract is unchanged');

      const gone = await pool.query(`SELECT count(*)::int n FROM entities WHERE id = $1`, [targetId]);
      assert.strictEqual(gone.rows[0].n, 0, 'the delete itself happened');

      const audit = await pool.query(
        `SELECT id FROM platform_audit_log WHERE action = 'hard_delete' AND notes LIKE $1 ORDER BY id DESC LIMIT 1`,
        [`%${targetId}%`]
      );
      assert.strictEqual(audit.rows.length, 1, 'the audit row is the durable evidence');

      const rows = await waitForKeyPrefix(`ENTITY_HARD_DELETE:${targetId}:${audit.rows[0].id}`, ids.recipientCount, { terminal: true });
      assert.ok(rows.length >= 1);
      assert.strictEqual(rows[0].template, 'admin-entity-hard-deleted');
      assert.strictEqual(rows[0].entity_id, null, 'the email_logs row must not reference the deleted entity (FK + self-erasure)');
      assert.ok(rows[0].payload.data.entityName.includes('ZZZ_TEST_ADMIN_NOTIF_HARD_DELETE_ME'));
      ids.deletableEntityId = null; // already gone, don't try to clean it up
    });

    /* ---------- 9. local preview via the stub mechanism ---------- */

    await check('local preview: EMAIL_DEV_PREVIEW=true + EMAIL_PROVIDER=stub writes the rendered admin alert to tmp/email-previews', async () => {
      setEmailEnv('false', 'stub'); // EMAIL_ENABLED stays false — devPreview is stub-only
      process.env.EMAIL_DEV_PREVIEW = 'true';
      fs.mkdirSync(PREVIEW_DIR, { recursive: true });
      const before = new Set(fs.readdirSync(PREVIEW_DIR));

      const result = await adminNotifications.sendAdminNotification('webhook_recovery_unresolved', {
        incidentKey: `WEBHOOK_UNRESOLVED:${RUN_TAG}-preview`,
        data: { webhookEventId: 999999, recordType: 'DetailRecurring', outcome: 'failed', error: 'ZZZ synthetic', receivedAt: new Date().toISOString() },
      });
      assert.ok(result.results.every((r) => r.status === 'stub'), 'the stub provider handled it even with EMAIL_ENABLED=false');

      const added = fs.readdirSync(PREVIEW_DIR).filter((f) => !before.has(f) && f.startsWith('admin-webhook-unresolved'));
      assert.ok(added.length >= 1, 'a preview file was written');
      const html = fs.readFileSync(path.join(PREVIEW_DIR, added[0]), 'utf8');
      assert.ok(html.includes('dir="rtl"'), 'reuses the shared RTL layout');
      usedIncidentKeys.push(`WEBHOOK_UNRESOLVED:${RUN_TAG}-preview`);
      process.env.EMAIL_DEV_PREVIEW = originalPreview;
    });

    /* ---------- 10. EMAIL_ENABLED remains the kill switch ---------- */

    await check('EMAIL_ENABLED=false with a real provider: an admin alert is logged as disabled and no provider is called', async () => {
      setEmailEnv('false', 'resend');
      delete process.env.EMAIL_DEV_PREVIEW;
      const before = fakeProviderCalls;
      const result = await adminNotifications.sendAdminNotification('entity_hard_deleted', {
        incidentKey: `ENTITY_HARD_DELETE:${RUN_TAG}-killswitch:0`,
        data: { entityId: 'zzz', entityName: 'ZZZ', actingAdminId: ids.superAdminUserId, auditLogId: 0 },
      });
      assert.ok(result.results.every((r) => r.status === 'disabled'));
      assert.strictEqual(fakeProviderCalls, before, 'the kill switch is honored for admin alerts exactly as for donor emails');
      usedIncidentKeys.push(`ENTITY_HARD_DELETE:${RUN_TAG}-killswitch:0`);
      process.env.EMAIL_DEV_PREVIEW = originalPreview;
    });

    /* ---------- 11. no sensitive data in a rendered admin email ---------- */

    await check('content safety: donor PII, payment data and CardCom credentials never appear in any rendered admin template, even when handed to it', async () => {
      const poison = {
        donorName: 'ZZZ_LEAK_DONOR_NAME',
        donorEmail: 'zzz-leak@example.invalid',
        donorPhone: '0500000001',
        cardNumber: '4580000000000000',
        cvv: '123',
        cardcom_api_password: 'ZZZ_LEAK_PASSWORD',
        ApiPassword: 'ZZZ_LEAK_PASSWORD',
        terminalNumber: 'ZZZ_LEAK_TERMINAL',
        rawPayload: { ZZZ_LEAK_PAYLOAD: true },
      };
      const forbidden = [
        'ZZZ_LEAK_DONOR_NAME', 'zzz-leak@example.invalid', '0500000001',
        '4580000000000000', 'ZZZ_LEAK_PASSWORD', 'ZZZ_LEAK_TERMINAL', 'ZZZ_LEAK_PAYLOAD',
      ];

      for (const [eventType, policy] of Object.entries(adminNotifications.EVENT_POLICY)) {
        const data = {
          ...poison,
          eventType,
          severity: policy.severity,
          jobName: 'zzz-job', jobRunId: 1, error: 'zzz',
          scope: 'scheduler', minutesSinceLastHeartbeat: 60,
          findingId: 1, findingType: eventType, subjectType: 'donation', subjectId: 'zzz-subject',
          webhookEventId: 1, outcome: 'failed',
          entityId: 'zzz-entity', entityName: 'ZZZ עמותה', auditLogId: 1, actingAdminId: 1,
          // Poison the per-finding details bag too — the template must render
          // only the named facts it knows about.
          details: { ...poison, reasons: ['webhook_low_profile_id_mismatch'] },
        };
        const { subject, html, text } = templates[policy.template](data);
        for (const needle of forbidden) {
          assert.ok(!html.includes(needle), `${eventType}/${policy.template} leaked ${needle} into html`);
          assert.ok(!text.includes(needle), `${eventType}/${policy.template} leaked ${needle} into text`);
          assert.ok(!subject.includes(needle), `${eventType}/${policy.template} leaked ${needle} into the subject`);
        }
        assert.ok(subject && subject.length > 0 && subject.length < 120, `${eventType} subject must be a concise Hebrew line`);
      }
    });

    /* ---------- 12. structural guards ---------- */

    await check('no notification is sent from a GET/read path: the ops controller contains no notification call', async () => {
      const controllerSrc = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'modules', 'platform', 'cardcom-ops', 'cardcom-ops.controller.js'), 'utf8'
      );
      // Looks for actual code, not for the words: both files MENTION the
      // notification service in their doc comments (on purpose — that is
      // where the boundary is documented), so the check is "no require of
      // it, no call into it".
      const codeLines = (src) => src.split('\n').filter((l) => !l.trimStart().startsWith('//'));
      const requiresNotifier = (src) => codeLines(src).some((l) => l.includes('require(') && l.includes('admin-notification'));

      assert.ok(!requiresNotifier(controllerSrc), 'cardcom-ops.controller.js must not import the notification service');
      assert.ok(!controllerSrc.includes('queueAdminNotification('), 'cardcom-ops.controller.js must not call queueAdminNotification');
      assert.ok(!controllerSrc.includes('sendAdminNotification('), 'cardcom-ops.controller.js must not call sendAdminNotification');
      assert.ok(!controllerSrc.includes('emailService'), 'cardcom-ops.controller.js must not send any email');

      const opsHealthSrc = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'modules', 'platform', 'cardcom-ops', 'ops-health.js'), 'utf8'
      );
      assert.ok(!requiresNotifier(opsHealthSrc), 'the shared detection module stays pure detection');
      assert.ok(!opsHealthSrc.includes('queueAdminNotification('), 'the shared detection module must not notify');

      // And the routes file: no route may reach the notifier either.
      const routesSrc = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'modules', 'platform', 'cardcom-ops', 'cardcom-ops.routes.js'), 'utf8'
      );
      assert.ok(!requiresNotifier(routesSrc) && !routesSrc.includes('AdminNotification'), 'the ops routes must not notify');
    });

    await check('every call site goes through the one central function — no job/handler calls emailService directly for an admin alert', async () => {
      const files = [
        'src/jobs/job-runner.js',
        'src/jobs/webhook-recovery.job.js',
        'src/jobs/stale-pending-donations.job.js',
        'src/jobs/stuck-recurring-signups.job.js',
        'src/jobs/operational-alerting.job.js',
        'src/modules/payment/handlers/payment.handler.js',
        'src/modules/payment/handlers/master-recurring.handler.js',
      ];
      for (const rel of files) {
        const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
        assert.ok(src.includes('queueAdminNotification'), `${rel} must notify through the central function`);
        assert.ok(!src.includes("require('../modules/email/email.service')") && !src.includes("require('../../email/email.service')"),
          `${rel} must not reach the email service directly`);
      }
    });

    await check('the three frozen reconciliation jobs still have no schedule — nothing here unfroze or rescheduled them', async () => {
      for (const name of ['billing-provisioning-gap', 'recurring-payment-reconciliation', 'billing-approval-consistency']) {
        const job = jobRunner.get(name);
        assert.ok(job, `${name} must still be registered`);
        assert.ok(!job.schedule, `${name} must still have no schedule (found: ${JSON.stringify(job.schedule)})`);
      }
    });

    await check('the real Resend provider send() was never reachable during this run', async () => {
      assert.notStrictEqual(resendProvider.send, realResendSend, 'the in-memory swap must still be in place');
      assert.ok(fakeProviderCalls >= 1, 'the only provider calls that happened went to the in-memory fake');
    });
  } finally {
    resendProvider.send = realResendSend;
    process.env.EMAIL_ENABLED = originalEnabled;
    process.env.EMAIL_PROVIDER = originalProvider;
    if (originalPreview === undefined) delete process.env.EMAIL_DEV_PREVIEW;
    else process.env.EMAIL_DEV_PREVIEW = originalPreview;
    // Let any in-flight fire-and-forget dispatch land before cleaning up.
    await new Promise((r) => setTimeout(r, 1500));
    await cleanup();
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
  await pool.end();
}

main().catch(async (err) => {
  console.error('FATAL', err);
  resendProvider.send = realResendSend;
  try { await cleanup(); } catch (_) {}
  process.exitCode = 1;
  await pool.end();
});
