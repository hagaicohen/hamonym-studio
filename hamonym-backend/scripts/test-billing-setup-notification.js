// Real-DB proof of the simplified (2026-09-10) billing-setup-notification
// behavior: attempt once, record the truthful outcome in `delivered`
// (migration 065), never retry. This replaces an automatic retry-until-
// delivered design that was built and tested the same day, then rolled
// back before being committed -- see billing-setup-notification.service.js's
// header comment for why.
//
// EMAIL_ENABLED/EMAIL_PROVIDER are overridden only in this process's own
// env (never written to .env, never touches Render) so the "delivered"
// path can be proven safely -- EMAIL_PROVIDER=stub never makes a real
// network call (see providers/stub.provider.js).
//
// Run: node scripts/test-billing-setup-notification-retry.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { notifyBillingSetupRequired } = require('../src/modules/billing-engine/billing-setup-notification.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const RUN_TAG = `zzz-test-notif-${Date.now()}`;
const ids = { entityId: null, ownerUserId: null, periodId: null };

async function setup() {
  const entity = await pool.query(
    `INSERT INTO entities (display_name, status, entity_type, created_by_user_id) VALUES ($1, 'active', 'association', 1) RETURNING id`,
    ['ZZZ_TEST_NOTIF_DO_NOT_USE']
  );
  ids.entityId = entity.rows[0].id;

  const owner = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Test Notif Owner', true) RETURNING id`,
    [`${RUN_TAG}-owner@example.invalid`]
  );
  ids.ownerUserId = owner.rows[0].id;

  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [ids.ownerUserId, ids.entityId]);

  const period = await pool.query(
    `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
    ['2099-08-01T00:00:00.000Z', '2099-08-02T00:00:00.000Z']
  );
  ids.periodId = period.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM email_logs WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM billing_setup_notifications WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [ids.periodId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [ids.ownerUserId]);
}

async function verifyZeroResidue() {
  const n = await pool.query(`SELECT count(*)::int AS n FROM entities WHERE id = $1`, [ids.entityId]);
  assert.strictEqual(n.rows[0].n, 0, 'fixture entity residue');
}

async function main() {
  const originalEnabled = process.env.EMAIL_ENABLED;
  const originalProvider = process.env.EMAIL_PROVIDER;

  await setup();
  try {
    await check('EMAIL_ENABLED=false: attempted once, honestly recorded as NOT delivered -- not claimed as success', async () => {
      process.env.EMAIL_ENABLED = 'false';
      const result = await notifyBillingSetupRequired({
        entityId: ids.entityId, entityName: 'ZZZ Test Notif', billingPeriodId: ids.periodId,
        blockingReason: 'no_billing_account', donationCount: 3, grossAmount: 900,
      });
      assert.strictEqual(result.sent, false);
      assert.strictEqual(result.reason, 'attempted_not_delivered');

      const row = await pool.query(`SELECT delivered, notified_admin_count FROM billing_setup_notifications WHERE entity_id = $1`, [ids.entityId]);
      assert.strictEqual(row.rows.length, 1);
      assert.strictEqual(row.rows[0].delivered, false);
      assert.strictEqual(row.rows[0].notified_admin_count, 0);
    });

    await check('a second run for the SAME (entity, period, reason) is a no-op -- no retry, even though the first attempt failed', async () => {
      const beforeLogs = await pool.query(`SELECT count(*)::int AS n FROM email_logs WHERE entity_id = $1`, [ids.entityId]);

      process.env.EMAIL_ENABLED = 'true';
      process.env.EMAIL_PROVIDER = 'stub';

      const result = await notifyBillingSetupRequired({
        entityId: ids.entityId, entityName: 'ZZZ Test Notif', billingPeriodId: ids.periodId,
        blockingReason: 'no_billing_account', donationCount: 3, grossAmount: 900,
      });
      assert.strictEqual(result.sent, false);
      assert.strictEqual(result.reason, 'already_notified', 'must not retry, even with email now enabled and a real delivery possible');

      const afterLogs = await pool.query(`SELECT count(*)::int AS n FROM email_logs WHERE entity_id = $1`, [ids.entityId]);
      assert.strictEqual(afterLogs.rows[0].n, beforeLogs.rows[0].n, 'no new send attempt on the second call -- the slot was already consumed by the first, even though it was not delivered');
    });

    await check('a different blocking_reason is an independent slot: EMAIL_ENABLED=true/stub delivers and is honestly recorded', async () => {
      const result = await notifyBillingSetupRequired({
        entityId: ids.entityId, entityName: 'ZZZ Test Notif', billingPeriodId: ids.periodId,
        blockingReason: 'account_suspended', donationCount: 1, grossAmount: 10,
      });
      assert.strictEqual(result.sent, true);
      assert.strictEqual(result.adminCount, 1);

      const row = await pool.query(`SELECT delivered, notified_admin_count FROM billing_setup_notifications WHERE entity_id = $1 AND blocking_reason = 'account_suspended'`, [ids.entityId]);
      assert.strictEqual(row.rows[0].delivered, true);
      assert.strictEqual(row.rows[0].notified_admin_count, 1);

      const log = await pool.query(`SELECT status FROM email_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.entityId]);
      assert.strictEqual(log.rows[0].status, 'stub');
    });
  } finally {
    process.env.EMAIL_ENABLED = originalEnabled;
    process.env.EMAIL_PROVIDER = originalProvider;
    await cleanup();
    await verifyZeroResidue();
    console.log('Fixture cleanup verified: zero residue.');
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
  await pool.end();
}

main().catch(async (err) => {
  console.error('FATAL', err);
  try { await cleanup(); } catch (_) {}
  process.exitCode = 1;
  await pool.end();
});
