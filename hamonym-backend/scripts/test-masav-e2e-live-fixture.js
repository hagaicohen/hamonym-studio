// Real-DB, real-function end-to-end proof of the MASAV v1 collection rail
// (Billing v1 Bundle 2, 2026-09-01 boundary correction) -- CARD was already
// proven live against real CardCom with a real ₪0.28 charge against a real
// entity; no real entity currently has total_due > the ₪3,540 card/masav
// threshold, and manufacturing real donation activity to cross it would
// permanently pollute production financial data. This script instead proves
// the real MASAV code path -- routing.js#resolveCollectionMethod,
// masav-config.service.js#upsertBankDetails/authorize,
// masav-collection.service.js#openMasavAttempt/generateExportExcel -- against
// a throwaway fixture entity, following the exact same live-fixture pattern
// as scripts/test-billing-bulk-approval-live-fixture.js.
//
// DEVIATION FROM A LITERAL "call the real approveStatement()" step, flagged
// explicitly rather than silently worked around: approval.service.js's
// validateForApproval() requires every statement_components row's donation
// to be status='paid' AND is_mock=false, and migration 054's
// trg_statement_components_no_update/no_delete triggers make ANY
// statement_components row permanently unconditionally undeletable forever
// (no exception for test data, no exception based on the referenced
// donation's status) -- and a statement referenced by a statement_components
// row can then never be deleted either (plain FK, no CASCADE). This is the
// exact conflict scripts/test-billing-bulk-approval-live-fixture.js's own
// header comment already documents and avoids. So this script -- like that
// one -- never creates a real statement_components row and never calls
// approveStatement(); it creates the fixture Statement directly at
// status='approved' via SQL (bypassing only the component-driven approval
// arithmetic, not any part of the MASAV rail itself) and proceeds from
// there. Every other step below calls the real, currently-deployed
// production function -- no mocks.
//
// Run: node scripts/test-masav-e2e-live-fixture.js

require('dotenv').config();
const assert = require('assert');
const XLSX = require('xlsx');
const pool = require('../src/db/db');
const routing = require('../src/modules/collection-engine/routing');
const masavConfigService = require('../src/modules/billing-engine/masav-config.service');
const masavCollectionService = require('../src/modules/collection-engine/masav-collection.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `ZZZ_TEST_DATA_DO_NOT_USE_masav-e2e-${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17; // test-scoped-admin@example.com, role_id 5 -- same fixture actor as other live-fixture scripts.
const TOTAL_DUE = 5000; // > CARD_MASAV_THRESHOLD (3540)

async function loadStatementForRouting(statementId) {
  const { rows } = await pool.query(
    `SELECT s.total_due, ba.entity_id FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     WHERE s.id = $1`,
    [statementId]
  );
  return rows[0];
}

async function main() {
  const fixture = {
    entityId: null, accountId: null, periodId: null, runId: null,
    statementId: null, attemptId: null,
  };

  try {
    // ---- fixture setup: entity -> billing_account -> billing_period ->
    // billing_run (production) -> statement, created directly at
    // status='approved' (see header comment for why approveStatement()
    // itself is not called). No donations, no statement_components --
    // deliberately, so every row this script creates stays cleanly
    // deletable. ----
    const entity = await pool.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, $2, 'active', 'association') RETURNING id`,
      [FIXTURE_TAG, SUPER_ADMIN_USER_ID]
    );
    fixture.entityId = entity.rows[0].id;

    const account = await pool.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate) VALUES ($1, 0.03, 0.18) RETURNING id`,
      [fixture.entityId]
    );
    fixture.accountId = account.rows[0].id;

    // Far-future, narrow window -- effectively impossible to collide with a
    // real billing period (and with test-billing-bulk-approval-live-
    // fixture.js's own 2099-01 window, if ever run concurrently).
    const periodStart = '2099-06-01T00:00:00.000Z';
    const periodEnd = '2099-06-02T00:00:00.000Z';
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
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, $3, 0.03, 0.18, $3, 0, $3, 'approved') RETURNING id, status`,
      [fixture.accountId, fixture.runId, TOTAL_DUE]
    );
    fixture.statementId = stmt.rows[0].id;
    assert.strictEqual(stmt.rows[0].status, 'approved');

    // ---- 3. resolveCollectionMethod with NO entity_masav_details row ----
    await check('3. resolveCollectionMethod: total_due > 3540 evaluates the masav branch and blocks with masav_not_configured (no config row at all)', async () => {
      const statement = await loadStatementForRouting(fixture.statementId);
      assert.ok(Number(statement.total_due) > routing.CARD_MASAV_THRESHOLD, 'fixture total_due must exceed the threshold');
      const result = await routing.resolveCollectionMethod(pool, statement);
      assert.deepStrictEqual(result, { method: null, blocked: true, reason: 'masav_not_configured' });
    });

    // ---- 4. upsertBankDetails -> still blocked, now masav_not_authorized ----
    await check('4. upsertBankDetails (real function) configures bank details; resolveCollectionMethod is still blocked, now masav_not_authorized', async () => {
      const config = await masavConfigService.upsertBankDetails({
        entityId: fixture.entityId,
        bankCode: '12',
        branchCode: '345',
        accountNumber: '000123456',
        accountHolderName: FIXTURE_TAG,
        superAdminUserId: SUPER_ADMIN_USER_ID,
        ip: '127.0.0.1',
      });
      assert.strictEqual(config.authorized, false);
      assert.strictEqual(config.bank_code, '12');

      const statement = await loadStatementForRouting(fixture.statementId);
      const result = await routing.resolveCollectionMethod(pool, statement);
      assert.deepStrictEqual(result, { method: null, blocked: true, reason: 'masav_not_authorized' });
    });

    // ---- 5. authorize -> resolveCollectionMethod now returns masav ----
    await check('5. authorize (real function, explicit Super Admin action) authorizes the fixture entity; resolveCollectionMethod now returns {method: masav}', async () => {
      const config = await masavConfigService.authorize({
        entityId: fixture.entityId,
        superAdminUserId: SUPER_ADMIN_USER_ID,
        notes: 'live-fixture e2e test',
        ip: '127.0.0.1',
      });
      assert.strictEqual(config.authorized, true);
      assert.ok(config.authorized_at);
      assert.strictEqual(String(config.authorized_by), String(SUPER_ADMIN_USER_ID));

      const statement = await loadStatementForRouting(fixture.statementId);
      const result = await routing.resolveCollectionMethod(pool, statement);
      assert.deepStrictEqual(result, { method: 'masav' });
    });

    // ---- 6. openMasavAttempt -> real collection_attempts row, statement approved->open ----
    await check('6. openMasavAttempt (real function) opens a collection_attempts row (method=masav, status=pending) and flips the Statement approved -> open', async () => {
      const opened = await masavCollectionService.openMasavAttempt(fixture.statementId);
      assert.strictEqual(opened.skipped, false);
      assert.ok(opened.attemptId);
      fixture.attemptId = opened.attemptId;

      const { rows: attemptRows } = await pool.query(
        `SELECT id, statement_id, collection_method, status, requested_amount, attempt_number FROM collection_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      assert.strictEqual(attemptRows.length, 1);
      assert.strictEqual(attemptRows[0].collection_method, 'masav');
      assert.strictEqual(attemptRows[0].status, 'pending');
      assert.strictEqual(Number(attemptRows[0].requested_amount), TOTAL_DUE);

      const { rows: stmtRows } = await pool.query(`SELECT status FROM statements WHERE id = $1`, [fixture.statementId]);
      assert.strictEqual(stmtRows[0].status, 'open');
    });

    let firstExportData = null;

    // ---- 7. generateExportExcel -> real, valid, correctly-shaped .xlsx ----
    await check('7. generateExportExcel (real function) returns a genuinely valid .xlsx buffer with the exact expected column set and values', async () => {
      const buffer = await masavCollectionService.generateExportExcel([fixture.statementId]);
      assert.ok(Buffer.isBuffer(buffer) && buffer.length > 0);

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      assert.deepStrictEqual(workbook.SheetNames, ['MASAV']);
      const sheet = workbook.Sheets['MASAV'];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      firstExportData = data;

      assert.deepStrictEqual(data[0], ['bank', 'branch', 'account', 'sum', 'tranmode', 'currency', 'company', 'contact', 'email', 'pdesc', 'remarks']);
      assert.strictEqual(data.length, 2);

      const row = data[1];
      assert.strictEqual(row[0], '12'); // bank
      assert.strictEqual(row[1], '345'); // branch
      assert.strictEqual(row[2], '000123456'); // account
      assert.strictEqual(Number(row[3]), TOTAL_DUE); // sum === statement.total_due exactly
      assert.strictEqual(row[4], 'T'); // tranmode
      assert.strictEqual(row[5], '1'); // currency
      assert.strictEqual(row[6], FIXTURE_TAG); // company (entity display_name)
      assert.strictEqual(row[9], `עמלת Hamonym 01/06/2099-02/06/2099`); // pdesc
      assert.strictEqual(row[10], fixture.statementId); // remarks
    });

    // ---- 8. boundary: no payments, statement still open, recordMasavResult absent ----
    await check('8. boundary holds: zero payments, statement still open (not paid), no recordMasavResult anywhere reachable', async () => {
      const { rows: payRows } = await pool.query(`SELECT id FROM payments WHERE statement_id = $1`, [fixture.statementId]);
      assert.strictEqual(payRows.length, 0);

      const { rows: stmtRows } = await pool.query(`SELECT status FROM statements WHERE id = $1`, [fixture.statementId]);
      assert.strictEqual(stmtRows[0].status, 'open');

      assert.strictEqual(masavCollectionService.recordMasavResult, undefined);
      assert.strictEqual(Object.keys(masavCollectionService).includes('recordMasavResult'), false);

      const fs = require('fs');
      const path = require('path');
      const collectionEngineDir = path.join(__dirname, '..', 'src', 'modules', 'collection-engine');
      const billingOpsDir = path.join(__dirname, '..', 'src', 'modules', 'platform', 'billing-ops');
      const searchDirs = [collectionEngineDir, billingOpsDir];
      let hits = [];
      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.js')) continue;
          const src = fs.readFileSync(path.join(dir, f), 'utf8');
          if (src.includes('recordMasavResult') && !src.includes('// recordMasavResult') && !src.match(/\/\/.*recordMasavResult/)) {
            hits.push(f);
          }
        }
      }
      assert.strictEqual(hits.length, 0, `recordMasavResult referenced outside comments in: ${hits.join(', ')}`);
    });

    // ---- 9. re-export is cleanly idempotent ----
    await check('9. generateExportExcel called a second time for the same open attempt is cleanly idempotent (identical data, no side effects)', async () => {
      const buffer2 = await masavCollectionService.generateExportExcel([fixture.statementId]);
      const workbook2 = XLSX.read(buffer2, { type: 'buffer' });
      const data2 = XLSX.utils.sheet_to_json(workbook2.Sheets['MASAV'], { header: 1 });
      assert.deepStrictEqual(data2, firstExportData);

      const { rows: attemptRows } = await pool.query(`SELECT id FROM collection_attempts WHERE statement_id = $1`, [fixture.statementId]);
      assert.strictEqual(attemptRows.length, 1, 're-export must not create a second attempt row');

      const { rows: payRows } = await pool.query(`SELECT id FROM payments WHERE statement_id = $1`, [fixture.statementId]);
      assert.strictEqual(payRows.length, 0);
    });

    // ---- 10. openMasavAttempt a second time while pending is blocked ----
    await check('10. openMasavAttempt called a second time while an attempt is already pending is blocked (attempt_already_active), same ACTIVE_ATTEMPT_STATUSES guard as the card rail', async () => {
      const second = await masavCollectionService.openMasavAttempt(fixture.statementId);
      assert.strictEqual(second.skipped, true);
      assert.strictEqual(second.reason, 'attempt_already_active');
      assert.strictEqual(second.attemptId, fixture.attemptId);

      const { rows: attemptRows } = await pool.query(`SELECT id FROM collection_attempts WHERE statement_id = $1`, [fixture.statementId]);
      assert.strictEqual(attemptRows.length, 1, 'no second collection_attempts row was created');
    });
  } finally {
    // ---- cleanup, FK-safe order. No donation/statement_components rows
    // were ever created (see header comment), so every row here is a plain,
    // unconditionally deletable fixture row -- collection_attempts has no
    // append-only trigger (only a provider_reference write-once UPDATE
    // guard, migration 059), unlike payments/statement_components. ----
    if (fixture.statementId) {
      await pool.query(`DELETE FROM collection_attempts WHERE statement_id = $1`, [fixture.statementId]);
    }
    if (fixture.entityId) {
      await pool.query(`DELETE FROM platform_audit_log WHERE entity_id = $1`, [fixture.entityId]);
      await pool.query(`DELETE FROM entity_masav_details WHERE entity_id = $1`, [fixture.entityId]);
    }
    if (fixture.statementId) {
      await pool.query(`DELETE FROM statements WHERE id = $1`, [fixture.statementId]);
    }
    if (fixture.runId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [fixture.runId]);
    if (fixture.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.periodId]);
    if (fixture.accountId) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [fixture.accountId]);
    if (fixture.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId]);

    await check('cleanup verification: zero residue -- every fixture row is gone', async () => {
      const [ca, emd, s, r, p, a, e, aud] = await Promise.all([
        fixture.statementId ? pool.query(`SELECT id FROM collection_attempts WHERE statement_id = $1`, [fixture.statementId]) : { rows: [] },
        fixture.entityId ? pool.query(`SELECT id FROM entity_masav_details WHERE entity_id = $1`, [fixture.entityId]) : { rows: [] },
        fixture.statementId ? pool.query(`SELECT id FROM statements WHERE id = $1`, [fixture.statementId]) : { rows: [] },
        fixture.runId ? pool.query(`SELECT id FROM billing_runs WHERE id = $1`, [fixture.runId]) : { rows: [] },
        fixture.periodId ? pool.query(`SELECT id FROM billing_periods WHERE id = $1`, [fixture.periodId]) : { rows: [] },
        fixture.accountId ? pool.query(`SELECT id FROM billing_accounts WHERE id = $1`, [fixture.accountId]) : { rows: [] },
        fixture.entityId ? pool.query(`SELECT id FROM entities WHERE id = $1`, [fixture.entityId]) : { rows: [] },
        fixture.entityId ? pool.query(`SELECT id FROM platform_audit_log WHERE entity_id = $1`, [fixture.entityId]) : { rows: [] },
      ]);
      assert.strictEqual(ca.rows.length, 0, 'collection_attempts residue');
      assert.strictEqual(emd.rows.length, 0, 'entity_masav_details residue');
      assert.strictEqual(s.rows.length, 0, 'statements residue');
      assert.strictEqual(r.rows.length, 0, 'billing_runs residue');
      assert.strictEqual(p.rows.length, 0, 'billing_periods residue');
      assert.strictEqual(a.rows.length, 0, 'billing_accounts residue');
      assert.strictEqual(e.rows.length, 0, 'entities residue');
      assert.strictEqual(aud.rows.length, 0, 'platform_audit_log residue');
    });
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
