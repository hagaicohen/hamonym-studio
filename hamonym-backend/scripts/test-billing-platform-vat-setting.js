// Regression coverage for platform-billing-settings.service.js -- the one
// system-wide VAT rate (2026-09-14i product decision, migration 066).
// Real-DB integration test: platform_billing_settings is a real, live,
// singleton row (id=1) shared with the running application, so every test
// below restores it to its original value in a finally block -- this script
// must never leave the real system VAT rate changed after it exits.
//
// Deliberately does NOT exercise calculateAccountStatement end-to-end with
// a real paid donation here -- that would create a real 'paid' donation row,
// which migration 055's trg_donations_block_paid_delete makes permanently
// undeletable (no is_mock exception), leaving unwanted permanent residue.
// That exact sourcing behavior (a Statement uses the platform rate, not a
// stale account.vat_rate; a later rate change affects only the next
// calculation, not an already-created Statement) is proven instead against
// a fully fake pool in scripts/test-billing-readiness-calculation.js
// (tests 13/14), following the same convention that file's own header
// comment documents for exactly this reason. This script instead proves:
// the settings row itself, the update endpoint's audit trail, and -- using
// a real Statement row built directly (no donations involved, same safe
// pattern as scripts/test-billing-bulk-approval-live-fixture.js) -- that
// the pre-existing DB-level immutability trigger still protects vat_rate
// once a Statement leaves 'draft', unchanged by this pass.
//
// Run: node scripts/test-billing-platform-vat-setting.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const settingsService = require('../src/modules/billing-engine/platform-billing-settings.service');
const provisioningService = require('../src/modules/billing-engine/provisioning.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const SUPER_ADMIN_USER_ID = 17; // same fixture actor as every other live-fixture script in this repo
const FIXTURE_TAG = `ZZZ_TEST_VAT_SETTING_${Date.now()}`;

async function main() {
  const fixture = { entityId: null, accountId: null, periodId: null, runId: null, statementId: null };
  let originalVatRate = null;

  try {
    const before = await settingsService.getSetting();
    assert.ok(before, 'platform_billing_settings must have exactly one row (id=1) -- migration 066 seeds it');
    originalVatRate = Number(before.vat_rate);

    await check('1. current system VAT rate is a valid configured fraction (default 18% unless a previous operator action changed it)', async () => {
      assert.ok(originalVatRate > 0 && originalVatRate < 1, `vat_rate must be a fraction, got ${originalVatRate}`);
    });

    await check('2. setVatRate updates the singleton row and writes a platform_audit_log entry with no entity_id (platform-level, not per-association)', async () => {
      const testRate = 0.19;
      const res = await settingsService.setVatRate({ vatRate: testRate, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1' });
      assert.strictEqual(Number(res.vat_rate), testRate);

      const after = await settingsService.getSetting();
      assert.strictEqual(Number(after.vat_rate), testRate);
      assert.strictEqual(Number(after.updated_by), SUPER_ADMIN_USER_ID);

      const { rows } = await pool.query(
        `SELECT entity_id, action, notes FROM platform_audit_log
         WHERE action = 'platform_vat_rate_update' AND super_admin_user_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [SUPER_ADMIN_USER_ID]
      );
      assert.ok(rows[0], 'expected an audit log row for the VAT rate change');
      assert.strictEqual(rows[0].entity_id, null);
      assert.ok(rows[0].notes.includes('0.19') || rows[0].notes.includes('19'), `audit note should mention the new rate, got: ${rows[0].notes}`);
    });

    await check('3. a newly-provisioned billing_account auto-populates vat_rate from the current system setting, with no vatRate input', async () => {
      const entity = await pool.query(
        `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
         VALUES ($1, $2, 'active', 'association') RETURNING id`,
        [FIXTURE_TAG, SUPER_ADMIN_USER_ID]
      );
      fixture.entityId = entity.rows[0].id;

      const account = await provisioningService.createBillingAccount({
        entityId: fixture.entityId,
        feeRate: 0.03,
        preferredCollectionMethod: 'card',
        superAdminUserId: SUPER_ADMIN_USER_ID,
        notes: 'test-billing-platform-vat-setting fixture',
        ip: '127.0.0.1',
      });
      fixture.accountId = account.id;

      assert.strictEqual(Number(account.vat_rate), 0.19, 'billing_accounts.vat_rate should be auto-populated from the system setting (0.19, set above)');
    });

    await check('4. changing the system VAT rate again does not retroactively change the already-provisioned billing_account row', async () => {
      await settingsService.setVatRate({ vatRate: 0.20, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1' });

      const { rows } = await pool.query(`SELECT vat_rate FROM billing_accounts WHERE id = $1`, [fixture.accountId]);
      assert.strictEqual(Number(rows[0].vat_rate), 0.19, 'billing_accounts.vat_rate is written once at creation and never rewritten by a later setting change');

      const setting = await settingsService.getSetting();
      assert.strictEqual(Number(setting.vat_rate), 0.20);
    });

    await check('5. a Statement built directly and promoted out of draft keeps its vat_rate/vat_amount/total_due even after the system rate changes again -- historical immutability is unaffected by this pass', async () => {
      const periodStart = '2099-02-01T00:00:00.000Z';
      const periodEnd = '2099-02-02T00:00:00.000Z';
      const period = await pool.query(
        `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
        [periodStart, periodEnd]
      );
      fixture.periodId = period.rows[0].id;

      const run = await pool.query(
        `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
         VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
        [fixture.periodId, periodStart]
      );
      fixture.runId = run.rows[0].id;

      const stmt = await pool.query(
        `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due)
         VALUES ($1, $2, 100, 0.03, 0.19, 3.00, 0.57, 3.57) RETURNING id, vat_rate, vat_amount, total_due`,
        [fixture.accountId, fixture.runId]
      );
      fixture.statementId = stmt.rows[0].id;
      assert.strictEqual(Number(stmt.rows[0].vat_rate), 0.19);

      // Promote out of draft -- status itself is explicitly allowed to
      // change by trg_statements_enforce_immutability (migration 054).
      await pool.query(`UPDATE statements SET status = 'approved' WHERE id = $1`, [fixture.statementId]);

      // System rate changes again, well after this Statement was calculated.
      await settingsService.setVatRate({ vatRate: 0.21, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1' });

      const { rows } = await pool.query(`SELECT vat_rate, vat_amount, total_due FROM statements WHERE id = $1`, [fixture.statementId]);
      assert.strictEqual(Number(rows[0].vat_rate), 0.19);
      assert.strictEqual(Number(rows[0].vat_amount), 0.57);
      assert.strictEqual(Number(rows[0].total_due), 3.57);
    });

    await check('6. Platform Admin cannot accidentally change historical financial data: a direct UPDATE of vat_rate on the now-approved Statement is rejected by the DB trigger', async () => {
      await assert.rejects(
        () => pool.query(`UPDATE statements SET vat_rate = 0.99 WHERE id = $1`, [fixture.statementId]),
        (err) => /frozen once status is not draft/.test(err.message),
      );

      const { rows } = await pool.query(`SELECT vat_rate FROM statements WHERE id = $1`, [fixture.statementId]);
      assert.strictEqual(Number(rows[0].vat_rate), 0.19, 'the rejected UPDATE must not have partially applied');
    });

    await check('7. setVatRate rejects an out-of-range value and leaves the setting unchanged', async () => {
      const before2 = await settingsService.getSetting();
      await assert.rejects(
        () => settingsService.setVatRate({ vatRate: 1.5, superAdminUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1' }),
        (err) => err.code === 'INVALID_VAT_RATE',
      );
      const after2 = await settingsService.getSetting();
      assert.strictEqual(Number(after2.vat_rate), Number(before2.vat_rate));
    });
  } finally {
    // ---- cleanup: statement has no components (never touched donations),
    // so it and everything above it is a plain, unconditionally deletable
    // fixture row. Restoring the real system VAT rate is the most important
    // line in this whole script -- it is live, shared, singleton state.
    if (fixture.statementId) await pool.query(`DELETE FROM statements WHERE id = $1`, [fixture.statementId]);
    if (fixture.runId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [fixture.runId]);
    if (fixture.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.periodId]);
    if (fixture.entityId) {
      await pool.query(`DELETE FROM platform_audit_log WHERE entity_id = $1`, [fixture.entityId]);
      await pool.query(`DELETE FROM billing_accounts WHERE entity_id = $1`, [fixture.entityId]);
      await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId]);
    }
    await pool.query(
      `DELETE FROM platform_audit_log WHERE action = 'platform_vat_rate_update' AND super_admin_user_id = $1`,
      [SUPER_ADMIN_USER_ID]
    );
    if (originalVatRate !== null) {
      await pool.query(`UPDATE platform_billing_settings SET vat_rate = $1, updated_at = NOW(), updated_by = NULL WHERE id = 1`, [originalVatRate]);
    }
  }

  await check('cleanup verification: zero residue -- fixture entity gone, system VAT rate restored', async () => {
    const { rows } = await pool.query(`SELECT count(*) FROM entities WHERE display_name = $1`, [FIXTURE_TAG]);
    assert.strictEqual(Number(rows[0].count), 0);
    const setting = await settingsService.getSetting();
    assert.strictEqual(Number(setting.vat_rate), originalVatRate);
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  await pool.end();
  process.exit(1);
});
