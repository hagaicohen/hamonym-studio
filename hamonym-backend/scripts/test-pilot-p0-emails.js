// Real-DB proof of the Pilot Email P0 work (2026-10-05):
//   * EMAIL_ENABLED stays a hard kill switch
//   * stub provider / successful send / provider failure all land honestly
//     in email_logs
//   * keyed emails are idempotent (migration 070's unique index, not a
//     prior SELECT)
//   * the three P0 flows (entity approved / entity rejected / recurring
//     charge failed) each queue their email only AFTER their own business
//     write is committed, and a provider failure never fails that write
//   * the pre-existing donation-paid receipt email still fires after commit
//
// EMAIL_ENABLED/EMAIL_PROVIDER are overridden only in THIS process's env
// (never written to .env, never anywhere near Render), and the "real
// provider" used below is the resend provider module with its send()
// swapped in memory — so no network call is ever made and no real inbox is
// ever touched. Same convention as test-billing-setup-notification.js.
//
// Run: node scripts/test-pilot-p0-emails.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const emailService = require('../src/modules/email/email.service');
const platformService = require('../src/modules/platform/platform.service');
const donationsService = require('../src/modules/donations/donations.service');
const detailRecurringHandler = require('../src/modules/payment/handlers/detail-recurring.handler');

// In-memory provider swap. email.service.js#getProvider does a plain
// require('./providers/resend.provider') per dispatch, so it always gets
// this same cached module object — overwriting .send here is enough, and
// nothing outside this process is affected.
const resendProvider = require('../src/modules/email/providers/resend.provider');
const realResendSend = resendProvider.send;
let fakeProviderMode = 'ok'; // 'ok' | 'throw'
let fakeProviderCalls = 0;
resendProvider.send = async ({ to, subject }) => {
  fakeProviderCalls++;
  if (fakeProviderMode === 'throw') throw new Error('simulated provider failure');
  return { providerMessageId: `fake-${Date.now()}-${fakeProviderCalls}`, stub: false };
};

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const RUN_TAG = `zzz-p0-email-${Date.now()}`;
const ids = {
  entityId: null, ownerUserId: null, superAdminUserId: null,
  campaignId: null, instructionId: null,
};

const OWNER_EMAIL = `${RUN_TAG}-owner@example.invalid`;
const DONOR_EMAIL = `${RUN_TAG}-donor@example.invalid`;

function setEmailEnv(enabled, provider) {
  process.env.EMAIL_ENABLED = enabled;
  process.env.EMAIL_PROVIDER = provider;
}

// emailService.queue() is setImmediate-based fire-and-forget, so a caller
// returning does not mean the row exists yet. Poll rather than guess a
// sleep duration.
async function waitForLogs(where, params, expectedCount, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await pool.query(
      `SELECT id, template, status, to_email, error, provider_message_id, idempotency_key, payload, donation_id
       FROM email_logs WHERE ${where} ORDER BY created_at ASC`,
      params
    );
    if (res.rows.length >= expectedCount || Date.now() > deadline) return res.rows;
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function logsForTemplate(template) {
  return waitForLogs(`entity_id = $1 AND template = $2`, [ids.entityId, template], 0, 0);
}

async function setup() {
  const sa = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, is_super_admin) VALUES (1, $1, 'ZZZ P0 Email SuperAdmin', true, true) RETURNING id`,
    [`${RUN_TAG}-sa@example.invalid`]
  );
  ids.superAdminUserId = sa.rows[0].id;

  const entity = await pool.query(
    `INSERT INTO entities (display_name, status, entity_type, created_by_user_id)
     VALUES ($1, 'pending_review', 'association', $2) RETURNING id`,
    ['ZZZ_TEST_P0_EMAIL_DO_NOT_USE', ids.superAdminUserId]
  );
  ids.entityId = entity.rows[0].id;

  const owner = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ P0 Email Owner', true) RETURNING id`,
    [OWNER_EMAIL]
  );
  ids.ownerUserId = owner.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [ids.ownerUserId, ids.entityId]);

  const campaign = await pool.query(
    `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1, $2, $3, 'draft') RETURNING id`,
    [ids.entityId, `${RUN_TAG}-campaign`, 'ZZZ קמפיין בדיקת מיילים']
  );
  ids.campaignId = campaign.rows[0].id;

  // cardcom_recurring_id must be unique enough not to collide with real
  // data — a negative value can never be a real CardCom id.
  const instruction = await pool.query(
    `INSERT INTO recurring_instructions (entity_id, campaign_id, donor_name, donor_email, donor_phone, amount, cardcom_recurring_id)
     VALUES ($1,$2,'ZZZ תורם בדיקה',$3,'0500000000',36,$4) RETURNING id`,
    [ids.entityId, ids.campaignId, DONOR_EMAIL, -1 * (Date.now() % 2000000000)]
  );
  ids.instructionId = instruction.rows[0].id;
  const riRes = await pool.query(`SELECT cardcom_recurring_id FROM recurring_instructions WHERE id = $1`, [ids.instructionId]);
  ids.cardcomRecurringId = riRes.rows[0].cardcom_recurring_id;
}

// Removes every row this fixture created, by this run's own ids/RUN_TAG
// only — never a blanket reset of any aggregate (see the project's E2E
// cleanup rule). Deliberately does NOT try to delete 'paid' donations or
// receipts, and does NOT disable any integrity trigger: this fixture never
// persists either (see the donation-paid tests' note). If one somehow
// exists, that is reported loudly rather than forced away.
async function cleanup() {
  if (!ids.entityId) return;

  const stuck = await pool.query(`SELECT count(*)::int n FROM donations WHERE entity_id = $1 AND status = 'paid'`, [ids.entityId]);
  if (stuck.rows[0].n > 0) {
    console.error(`CLEANUP WARNING: ${stuck.rows[0].n} paid donation(s) exist for the fixture entity and are undeletable by design (migration 055). Entity ${ids.entityId} will be left behind — investigate, do not disable the trigger.`);
    return;
  }

  await pool.query(`DELETE FROM email_logs WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM email_logs WHERE to_email IN ($1,$2)`, [OWNER_EMAIL, DONOR_EMAIL]);
  await pool.query(`DELETE FROM donations WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM recurring_instructions WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM campaigns WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM platform_audit_log WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [ids.entityId]);
  if (ids.ownerUserId) await pool.query(`DELETE FROM users WHERE id = $1`, [ids.ownerUserId]);
  if (ids.superAdminUserId) await pool.query(`DELETE FROM users WHERE id = $1`, [ids.superAdminUserId]);
}

async function main() {
  const originalEnabled = process.env.EMAIL_ENABLED;
  const originalProvider = process.env.EMAIL_PROVIDER;

  await setup();
  try {
    /* ---------- email.service core behavior ---------- */

    await check('EMAIL_ENABLED=false is a hard kill switch: logged as disabled, provider never called', async () => {
      setEmailEnv('false', 'resend');
      const before = fakeProviderCalls;
      const result = await emailService.send({
        template: 'entity-approved',
        to: OWNER_EMAIL,
        data: { entityName: 'ZZZ', dashboardUrl: 'http://x/dashboard' },
        entityId: ids.entityId,
      });
      assert.strictEqual(result.status, 'disabled');
      assert.strictEqual(fakeProviderCalls, before, 'provider must not be called at all when disabled');
      const rows = await pool.query(`SELECT status FROM email_logs WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 1`, [ids.entityId]);
      assert.strictEqual(rows.rows[0].status, 'disabled');
    });

    await check('stub provider: nothing sent, recorded as stub', async () => {
      setEmailEnv('true', 'stub');
      const result = await emailService.send({
        template: 'entity-approved',
        to: OWNER_EMAIL,
        data: { entityName: 'ZZZ', dashboardUrl: 'http://x/dashboard' },
        entityId: ids.entityId,
      });
      assert.strictEqual(result.status, 'stub');
      const rows = await pool.query(`SELECT status, sent_at FROM email_logs WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 1`, [ids.entityId]);
      assert.strictEqual(rows.rows[0].status, 'stub');
      assert.ok(rows.rows[0].sent_at, 'stub counts as an attempt that completed');
    });

    await check('successful real-provider send: status=sent with the provider message id', async () => {
      setEmailEnv('true', 'resend');
      fakeProviderMode = 'ok';
      const result = await emailService.send({
        template: 'entity-approved',
        to: OWNER_EMAIL,
        data: { entityName: 'ZZZ', dashboardUrl: 'http://x/dashboard' },
        entityId: ids.entityId,
      });
      assert.strictEqual(result.status, 'sent');
      assert.ok(result.providerMessageId);
      const rows = await pool.query(`SELECT status, provider, provider_message_id FROM email_logs WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 1`, [ids.entityId]);
      assert.strictEqual(rows.rows[0].status, 'sent');
      assert.strictEqual(rows.rows[0].provider, 'resend');
      assert.strictEqual(rows.rows[0].provider_message_id, result.providerMessageId);
    });

    await check('provider failure: status=failed with the error recorded, never thrown to the caller', async () => {
      setEmailEnv('true', 'resend');
      fakeProviderMode = 'throw';
      const result = await emailService.send({
        template: 'entity-approved',
        to: OWNER_EMAIL,
        data: { entityName: 'ZZZ', dashboardUrl: 'http://x/dashboard' },
        entityId: ids.entityId,
      });
      assert.strictEqual(result.status, 'failed');
      assert.match(result.error, /simulated provider failure/);
      const rows = await pool.query(`SELECT status, error FROM email_logs WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 1`, [ids.entityId]);
      assert.strictEqual(rows.rows[0].status, 'failed');
      fakeProviderMode = 'ok';
    });

    await check('idempotencyKey: a repeated send for the same logical event is suppressed, not re-sent', async () => {
      setEmailEnv('true', 'stub');
      const key = `ZZZ_TEST_KEY:${RUN_TAG}`;
      const first = await emailService.send({
        template: 'entity-approved', to: OWNER_EMAIL,
        data: { entityName: 'ZZZ', dashboardUrl: 'http://x/dashboard' },
        entityId: ids.entityId, idempotencyKey: key,
      });
      assert.strictEqual(first.status, 'stub');

      const before = fakeProviderCalls;
      const second = await emailService.send({
        template: 'entity-approved', to: OWNER_EMAIL,
        data: { entityName: 'ZZZ', dashboardUrl: 'http://x/dashboard' },
        entityId: ids.entityId, idempotencyKey: key,
      });
      assert.strictEqual(second.status, 'duplicate');
      assert.strictEqual(fakeProviderCalls, before, 'the duplicate must not reach any provider');

      const rows = await pool.query(`SELECT count(*)::int n FROM email_logs WHERE idempotency_key = $1`, [key]);
      assert.strictEqual(rows.rows[0].n, 1, 'exactly one row may ever own an idempotency_key');
    });

    await check('unkeyed legacy callers are unaffected: two identical sends still produce two rows', async () => {
      setEmailEnv('true', 'stub');
      const before = await pool.query(`SELECT count(*)::int n FROM email_logs WHERE entity_id=$1 AND idempotency_key IS NULL`, [ids.entityId]);
      for (let i = 0; i < 2; i++) {
        await emailService.send({
          template: 'billing-setup-required', to: OWNER_EMAIL,
          data: { entityName: 'ZZZ', donationCount: 1, grossAmount: 1, settingsUrl: 'http://x' },
          entityId: ids.entityId,
        });
      }
      const after = await pool.query(`SELECT count(*)::int n FROM email_logs WHERE entity_id=$1 AND idempotency_key IS NULL`, [ids.entityId]);
      assert.strictEqual(after.rows[0].n - before.rows[0].n, 2);
    });

    /* ---------- Flow 1: donation-paid receipt (regression) ---------- */

    // NOTE on why this flow is proved in two parts rather than by creating
    // one real paid donation: migration 055 installs
    // trg_donations_block_paid_delete and trg_receipts_block_delete, so a
    // 'paid' donation and its receipt are PERMANENT by design — a fixture
    // that creates them cannot clean up after itself and would leave a fake
    // ₪ figure in the pilot DB's real aggregates forever. Those triggers are
    // correct and are not worked around here (no trigger is disabled, no
    // session_replication_role games). Instead: part A proves the
    // finalize-inside-transaction primitive and rolls it back; part B proves
    // the post-commit email step against a deletable (pending) donation row.
    await check('REGRESSION donation-paid A: finalizePaidDonation issues the receipt inside the transaction, and a rollback erases it (so queuing before COMMIT would be wrong)', async () => {
      let captured = null;
      await assert.rejects(
        donationsService.withTransaction(async (client) => {
          const don = await client.query(
            `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, donor_email, status, completed_at)
             VALUES ($1,$2,54,'ZZZ תורם בדיקה',$3,'paid',NOW()) RETURNING id`,
            [ids.campaignId, ids.entityId, DONOR_EMAIL]
          );
          captured = { donationId: don.rows[0].id, receipt: await donationsService.finalizePaidDonation(don.rows[0].id, client) };
          throw new Error('ZZZ forced rollback');
        }),
        /ZZZ forced rollback/
      );

      assert.ok(captured.receipt, 'finalizePaidDonation must return the newly issued receipt');
      assert.ok(captured.receipt.receipt_number, 'with a real receipt_number');
      assert.strictEqual(captured.receipt.donor_email, DONOR_EMAIL);

      const d = await pool.query(`SELECT count(*)::int n FROM donations WHERE id = $1`, [captured.donationId]);
      const r = await pool.query(`SELECT count(*)::int n FROM receipts WHERE donation_id = $1`, [captured.donationId]);
      assert.strictEqual(d.rows[0].n, 0, 'the rollback erased the donation');
      assert.strictEqual(r.rows[0].n, 0, 'and the receipt — which is exactly why the email is queued only after COMMIT');
    });

    await check('REGRESSION donation-paid B: the post-commit step still queues the receipt email, with the corrected non-official wording', async () => {
      setEmailEnv('true', 'stub');
      const don = await pool.query(
        `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, donor_email, status)
         VALUES ($1,$2,54,'ZZZ תורם בדיקה',$3,'pending') RETURNING id`,
        [ids.campaignId, ids.entityId, DONOR_EMAIL]
      );
      const donationId = don.rows[0].id;

      await donationsService.queueReceiptEmail({
        id: '00000000-0000-0000-0000-000000000000',
        receipt_number: 'ZZZ-1',
        entity_id: ids.entityId,
        campaign_id: ids.campaignId,
        amount: 54,
        donor_name: 'ZZZ תורם בדיקה',
        donor_email: DONOR_EMAIL,
      }, donationId);

      const rows = await waitForLogs(`donation_id = $1 AND template = 'receipt'`, [donationId], 1);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].status, 'stub');
      assert.strictEqual(rows[0].to_email, DONOR_EMAIL);

      const subj = await pool.query(`SELECT subject FROM email_logs WHERE id = $1`, [rows[0].id]);
      assert.ok(subj.rows[0].subject.includes('אישור תרומה'), 'Step 3 wording: neutral donation confirmation');
      assert.ok(!subj.rows[0].subject.includes('קבלה'), 'must no longer call itself a קבלה');
    });

    await check('REGRESSION donation-paid: queueReceiptEmail never throws, even when the provider fails', async () => {
      setEmailEnv('true', 'resend');
      fakeProviderMode = 'throw';
      const don = await pool.query(
        `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, donor_email, status)
         VALUES ($1,$2,54,'ZZZ תורם בדיקה',$3,'pending') RETURNING id`,
        [ids.campaignId, ids.entityId, DONOR_EMAIL]
      );
      const donationId = don.rows[0].id;

      // Must resolve, not reject — a payment that already committed cannot
      // be surfaced to the donor as a failure because of an email problem.
      await donationsService.queueReceiptEmail({
        id: '00000000-0000-0000-0000-000000000000', receipt_number: 'ZZZ-2',
        entity_id: ids.entityId, campaign_id: ids.campaignId, amount: 54,
        donor_name: 'ZZZ תורם בדיקה', donor_email: DONOR_EMAIL,
      }, donationId);

      const rows = await waitForLogs(`donation_id = $1 AND status = 'failed'`, [donationId], 1);
      assert.strictEqual(rows.length, 1, 'the provider error lands in email_logs only');
      const d = await pool.query(`SELECT status FROM donations WHERE id = $1`, [donationId]);
      assert.strictEqual(d.rows[0].status, 'pending', 'the donation row is untouched by the email failure');
      fakeProviderMode = 'ok';
    });

    /* ---------- Flow 2: entity rejection ---------- */

    await check('entity rejection: email queued after commit, carrying the decision note the entity already sees', async () => {
      setEmailEnv('true', 'stub');
      const REASON = 'חסרים מסמכי רישום — ZZZ בדיקה';
      const entity = await platformService.reject(ids.entityId, ids.superAdminUserId, REASON, ['missing_documents'], '127.0.0.1');
      assert.strictEqual(entity.status, 'rejected', 'the business write must be committed before anything else');

      const rows = await waitForLogs(`entity_id = $1 AND template = 'entity-rejected'`, [ids.entityId], 1);
      assert.strictEqual(rows.length, 1, 'exactly one owner, exactly one email');
      assert.strictEqual(rows[0].to_email, OWNER_EMAIL);
      assert.strictEqual(rows[0].status, 'stub');
      assert.match(rows[0].idempotency_key, /^ENTITY_REJECTED:/);
      assert.ok(rows[0].payload.data.reason.includes('ZZZ בדיקה'), 'the user-facing decision note must be carried');
    });

    await check('entity rejection with NO note: neutral email, no invented reason', async () => {
      setEmailEnv('true', 'stub');
      await platformService.reject(ids.entityId, ids.superAdminUserId, '   ', null, '127.0.0.1');
      const rows = await waitForLogs(`entity_id = $1 AND template = 'entity-rejected'`, [ids.entityId], 2);
      assert.strictEqual(rows.length, 2, 'a NEW decision is a new audit row, so a new email — not a duplicate');
      const latest = rows[rows.length - 1];
      assert.ok(!latest.payload.data.reason || !String(latest.payload.data.reason).trim(), 'no reason must be passed when the note is blank');
      const { text } = require('../src/modules/email/templates/entity-rejected')(latest.payload.data);
      assert.ok(text.includes('לפנות אלינו'), 'falls back to the neutral contact-us wording');
    });

    await check('entity rejection: a provider failure does not fail the rejection itself', async () => {
      setEmailEnv('true', 'resend');
      fakeProviderMode = 'throw';
      const entity = await platformService.reject(ids.entityId, ids.superAdminUserId, 'ZZZ provider-failure probe', null, '127.0.0.1');
      assert.strictEqual(entity.status, 'rejected');
      const rows = await waitForLogs(`entity_id = $1 AND template = 'entity-rejected' AND status = 'failed'`, [ids.entityId], 1);
      assert.strictEqual(rows.length, 1, 'the failure is recorded in email_logs, not raised to the admin');
      fakeProviderMode = 'ok';
    });

    /* ---------- Flow 3: entity approval ---------- */

    await check('entity approval: email queued after commit, to the resolved owner, exactly once', async () => {
      setEmailEnv('true', 'stub');
      const entity = await platformService.approve(ids.entityId, ids.superAdminUserId, 'ZZZ approved', null, '127.0.0.1');
      assert.strictEqual(entity.status, 'active');

      const rows = await waitForLogs(`entity_id = $1 AND template = 'entity-approved' AND idempotency_key LIKE 'ENTITY_APPROVED:%'`, [ids.entityId], 1);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].to_email, OWNER_EMAIL);
      assert.strictEqual(rows[0].status, 'stub');
      assert.strictEqual(rows[0].payload.data.dashboardUrl.endsWith('/dashboard'), true);
      ids.approvalKey = rows[0].idempotency_key;
    });

    await check('entity approval: re-queuing the SAME decision is suppressed by the idempotency key', async () => {
      setEmailEnv('true', 'stub');
      const before = fakeProviderCalls;
      const result = await emailService.send({
        template: 'entity-approved', to: OWNER_EMAIL,
        data: { entityName: 'ZZZ', dashboardUrl: 'http://x/dashboard' },
        entityId: ids.entityId, idempotencyKey: ids.approvalKey,
      });
      assert.strictEqual(result.status, 'duplicate');
      assert.strictEqual(fakeProviderCalls, before);
      const rows = await pool.query(`SELECT count(*)::int n FROM email_logs WHERE idempotency_key = $1`, [ids.approvalKey]);
      assert.strictEqual(rows.rows[0].n, 1);
    });

    await check('entity approval: a provider failure does not fail the approval itself', async () => {
      setEmailEnv('true', 'resend');
      fakeProviderMode = 'throw';
      const entity = await platformService.approve(ids.entityId, ids.superAdminUserId, 'ZZZ approve probe', null, '127.0.0.1');
      assert.strictEqual(entity.status, 'active', 'the entity is still active even though the email blew up');
      const rows = await waitForLogs(`entity_id = $1 AND template = 'entity-approved' AND status = 'failed'`, [ids.entityId], 1);
      assert.strictEqual(rows.length, 1);
      fakeProviderMode = 'ok';
    });

    /* ---------- Flow 4: recurring charge failure ---------- */

    await check('recurring failure (ONHOLD): donor email queued only after the failed donation is persisted', async () => {
      setEmailEnv('true', 'stub');
      const dealNumber = `ZZZ${Date.now()}`;
      await detailRecurringHandler.handle({
        RecordType: 'DetailRecurring',
        RecurringId: ids.cardcomRecurringId,
        InternalDealNumber: dealNumber,
        Status: 'ONHOLD',
        Sum: 36,
      });

      const don = await pool.query(
        `SELECT id, status, failure_reason FROM donations WHERE recurring_instruction_id = $1 AND provider_reference = $2`,
        [ids.instructionId, dealNumber]
      );
      assert.strictEqual(don.rows.length, 1, 'the failed donation row must exist before the email');
      assert.strictEqual(don.rows[0].status, 'failed');
      assert.strictEqual(don.rows[0].failure_reason, 'cardcom_recurring_onhold');

      const rows = await waitForLogs(`donation_id = $1 AND template = 'recurring-payment-failed'`, [don.rows[0].id], 1);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].to_email, DONOR_EMAIL);
      assert.strictEqual(rows[0].idempotency_key, `RECURRING_PAYMENT_FAILED:${ids.instructionId}:${dealNumber}`);
      ids.onholdDeal = dealNumber;
    });

    await check('recurring failure: a redelivered webhook produces neither a second donation nor a second email', async () => {
      setEmailEnv('true', 'stub');
      const beforeDon = await pool.query(`SELECT count(*)::int n FROM donations WHERE recurring_instruction_id = $1`, [ids.instructionId]);
      const beforeLogs = await pool.query(`SELECT count(*)::int n FROM email_logs WHERE template='recurring-payment-failed' AND entity_id=$1`, [ids.entityId]);

      // Exact redelivery — stopped by the handler's own business-key guard.
      await detailRecurringHandler.handle({
        RecordType: 'DetailRecurring', RecurringId: ids.cardcomRecurringId,
        InternalDealNumber: ids.onholdDeal, Status: 'ONHOLD', Sum: 36,
      });
      // Belt and braces: the email layer's own idempotency key would stop it
      // even if the handler guard were bypassed (e.g. a recovery re-run).
      const direct = await emailService.send({
        template: 'recurring-payment-failed', to: DONOR_EMAIL,
        data: { campaignTitle: 'ZZZ' },
        entityId: ids.entityId,
        idempotencyKey: `RECURRING_PAYMENT_FAILED:${ids.instructionId}:${ids.onholdDeal}`,
      });
      assert.strictEqual(direct.status, 'duplicate');

      await new Promise((r) => setTimeout(r, 300));
      const afterDon = await pool.query(`SELECT count(*)::int n FROM donations WHERE recurring_instruction_id = $1`, [ids.instructionId]);
      const afterLogs = await pool.query(`SELECT count(*)::int n FROM email_logs WHERE template='recurring-payment-failed' AND entity_id=$1`, [ids.entityId]);
      assert.strictEqual(afterDon.rows[0].n, beforeDon.rows[0].n, 'no second donation');
      assert.strictEqual(afterLogs.rows[0].n, beforeLogs.rows[0].n, 'no second email');
    });

    await check('recurring failure: an AMBIGUOUS status records the failed donation but deliberately emails nothing', async () => {
      setEmailEnv('true', 'stub');
      const dealNumber = `ZZZP${Date.now()}`;
      await detailRecurringHandler.handle({
        RecordType: 'DetailRecurring', RecurringId: ids.cardcomRecurringId,
        InternalDealNumber: dealNumber, Status: 'PENDINGFORPROCESSING', Sum: 36,
      });

      const don = await pool.query(
        `SELECT id, status FROM donations WHERE recurring_instruction_id = $1 AND provider_reference = $2`,
        [ids.instructionId, dealNumber]
      );
      assert.strictEqual(don.rows.length, 1, 'bookkeeping is unchanged — the row is still written');
      assert.strictEqual(don.rows[0].status, 'failed');

      await new Promise((r) => setTimeout(r, 300));
      const logs = await pool.query(`SELECT count(*)::int n FROM email_logs WHERE donation_id = $1`, [don.rows[0].id]);
      assert.strictEqual(logs.rows[0].n, 0, 'PENDINGFORPROCESSING must never tell a donor the charge failed');
    });

    await check('recurring failure: a provider failure does not fail the webhook handler', async () => {
      setEmailEnv('true', 'resend');
      fakeProviderMode = 'throw';
      const dealNumber = `ZZZF${Date.now()}`;
      await detailRecurringHandler.handle({
        RecordType: 'DetailRecurring', RecurringId: ids.cardcomRecurringId,
        InternalDealNumber: dealNumber, Status: 'ONHOLD', Sum: 36,
      });
      const don = await pool.query(
        `SELECT id, status FROM donations WHERE recurring_instruction_id = $1 AND provider_reference = $2`,
        [ids.instructionId, dealNumber]
      );
      assert.strictEqual(don.rows.length, 1, 'the failed donation is committed regardless of the email outcome');
      assert.strictEqual(don.rows[0].status, 'failed');
      const rows = await waitForLogs(`donation_id = $1 AND status = 'failed'`, [don.rows[0].id], 1);
      assert.strictEqual(rows.length, 1, 'the provider error is recorded in email_logs only');
      fakeProviderMode = 'ok';
    });

    /* ---------- Recovery job ---------- */

    await check('email-dispatch-recovery: a stranded pending row is re-dispatched from its stored intent', async () => {
      setEmailEnv('true', 'stub');
      const key = `ZZZ_TEST_STRANDED:${RUN_TAG}`;
      const stranded = await pool.query(
        `INSERT INTO email_logs (to_email, template, subject, status, provider, entity_id, idempotency_key, payload, created_at)
         VALUES ($1,'entity-approved','ZZZ','pending','stub',$2,$3,$4, NOW() - INTERVAL '10 minutes')
         RETURNING id`,
        [OWNER_EMAIL, ids.entityId, key, JSON.stringify({ template: 'entity-approved', to: OWNER_EMAIL, data: { entityName: 'ZZZ', dashboardUrl: 'http://x/dashboard' }, entityId: ids.entityId })]
      );

      const jobRunner = require('../src/jobs');
      const run = await jobRunner.run('email-dispatch-recovery', { triggeredBy: 'test' });
      assert.strictEqual(run.status, 'success', run.error || '');

      const after = await pool.query(`SELECT status FROM email_logs WHERE id = $1`, [stranded.rows[0].id]);
      assert.strictEqual(after.rows[0].status, 'stub', 'the stranded intent reached the provider on recovery');
      const dup = await pool.query(`SELECT count(*)::int n FROM email_logs WHERE idempotency_key = $1`, [key]);
      assert.strictEqual(dup.rows[0].n, 1, 'recovery must not create a second row / consume a second key');
      await pool.query(`DELETE FROM job_runs WHERE job_name = 'email-dispatch-recovery' AND triggered_by = 'test'`);
    });
  } finally {
    resendProvider.send = realResendSend;
    process.env.EMAIL_ENABLED = originalEnabled;
    process.env.EMAIL_PROVIDER = originalProvider;
    await cleanup();
    const residue = await pool.query(`SELECT count(*)::int n FROM entities WHERE id = $1`, [ids.entityId]);
    console.log(`Fixture cleanup: entity residue = ${residue.rows[0].n}`);
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
