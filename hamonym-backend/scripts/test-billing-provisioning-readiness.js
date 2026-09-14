// Regression coverage for provisioning.service.js#listBillingReadiness --
// the new read-only projection backing the Platform Admin "הגדרות עמותות"
// tab (UX simplification pass, 2026-09-14), which merges what used to be
// two separate screens (the unprovisioned-entities list, and per-entity
// fee/VAT/MASAV lookups on platform-billing-setup-page) into one list.
// Purely additive/read-only -- no schema change, no financial mutation
// capability. Uses a single throwaway entity, no donations/statements
// involved, so a plain DELETE cleanup is safe (nothing here is append-only
// or immutability-protected).
//
// Run: node scripts/test-billing-provisioning-readiness.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const provisioningService = require('../src/modules/billing-engine/provisioning.service');
const masavConfigService = require('../src/modules/billing-engine/masav-config.service');

const FIXTURE_TAG = `ZZZ_TEST_READINESS_${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17; // test-scoped-admin@example.com -- same fixture actor other live-fixture scripts use

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let entityId = null;
let billingAccountId = null;

async function cleanup() {
  if (!entityId) return;
  await pool.query(`DELETE FROM platform_audit_log WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entity_masav_details WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM billing_accounts WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  try {
    await check('1. an active entity with no billing_account appears in the readiness list with a null billing_account_id', async () => {
      const entity = await pool.query(
        `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
         VALUES ($1, $2, 'active', 'association') RETURNING id`,
        [FIXTURE_TAG, SUPER_ADMIN_USER_ID]
      );
      entityId = entity.rows[0].id;

      const rows = await provisioningService.listBillingReadiness();
      const row = rows.find((r) => r.id === entityId);
      assert.ok(row, 'the fixture entity must appear in the readiness list');
      assert.strictEqual(row.billing_account_id, null);
      assert.strictEqual(row.masav_configured, false);
    });

    await check('2. after provisioning a billing_account, the same entity reflects fee/vat/enforcement_status', async () => {
      const account = await provisioningService.createBillingAccount({
        entityId,
        feeRate: 0.03,
        vatRate: 0.18,
        preferredCollectionMethod: 'card',
        superAdminUserId: SUPER_ADMIN_USER_ID,
        notes: 'test-billing-provisioning-readiness fixture',
        ip: '127.0.0.1',
      });
      billingAccountId = account.id;

      const rows = await provisioningService.listBillingReadiness();
      const row = rows.find((r) => r.id === entityId);
      assert.ok(row);
      assert.strictEqual(row.billing_account_id, billingAccountId);
      assert.strictEqual(Number(row.fee_rate), 0.03);
      assert.strictEqual(Number(row.vat_rate), 0.18);
      assert.strictEqual(row.enforcement_status, 'active');
      assert.strictEqual(row.masav_configured, false);
      assert.strictEqual(row.masav_authorized, null);
    });

    await check('3. after configuring MASAV bank details (not yet authorized), masav_configured is true and masav_authorized is false', async () => {
      await masavConfigService.upsertBankDetails({
        entityId,
        bankCode: '12',
        branchCode: '345',
        accountNumber: '000123456',
        accountHolderName: FIXTURE_TAG,
        actorUserId: SUPER_ADMIN_USER_ID,
        ip: '127.0.0.1',
      });

      const rows = await provisioningService.listBillingReadiness();
      const row = rows.find((r) => r.id === entityId);
      assert.ok(row);
      assert.strictEqual(row.masav_configured, true);
      assert.strictEqual(row.masav_authorized, false);
    });

    await check('4. after explicit MASAV authorization, masav_authorized is true', async () => {
      await masavConfigService.authorize({
        entityId,
        superAdminUserId: SUPER_ADMIN_USER_ID,
        notes: 'test-billing-provisioning-readiness fixture',
        ip: '127.0.0.1',
      });

      const rows = await provisioningService.listBillingReadiness();
      const row = rows.find((r) => r.id === entityId);
      assert.ok(row);
      assert.strictEqual(row.masav_authorized, true);
    });
  } finally {
    await cleanup();
  }

  await check('cleanup verification: zero residue -- the fixture entity is gone', async () => {
    const { rows } = await pool.query(`SELECT count(*) FROM entities WHERE display_name = $1`, [FIXTURE_TAG]);
    assert.strictEqual(Number(rows[0].count), 0);
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  try { await cleanup(); } catch {}
  await pool.end();
  process.exit(1);
});
