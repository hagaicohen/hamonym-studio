// Real-DB regression test for getApprovalStatus's audit-log filter
// (entities.service.js#getApprovalStatus) -- fixes a real bug where the
// single most-recent platform_audit_log row for an entity, regardless of
// action type, leaked verbatim onto the association's own Settings page as
// an "issues to complete" comment. Found live: a Super Admin's
// billing_account_create action auto-writes an internal note
// ("fee_rate=0.03 vat_rate=0.18 preferred_collection_method=card") that
// then surfaced as if it were an approval-reviewer comment.
//
// Everything created here is throwaway and fully deleted at the end
// (verified by re-querying).
//
// Run: node scripts/test-approval-status-audit-filter.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const entitiesService = require('../src/modules/entities/entities.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const RUN_TAG = `zzz-test-approval-audit-filter-${Date.now()}`;
const ids = { superAdmin: null, entityId: null, ownerUser: null };

async function setup() {
  const admin = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, is_super_admin) VALUES (2, $1, 'ZZZ Test Super Admin', true, true) RETURNING id`,
    [`${RUN_TAG}-admin@example.invalid`]
  );
  ids.superAdmin = admin.rows[0].id;

  const owner = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Test Owner', true) RETURNING id`,
    [`${RUN_TAG}-owner@example.invalid`]
  );
  ids.ownerUser = owner.rows[0].id;

  const entity = await pool.query(
    `INSERT INTO entities (display_name, status, created_by_user_id) VALUES ($1, 'active', $2) RETURNING id`,
    ['ZZZ_TEST_APPROVAL_AUDIT_FILTER_DO_NOT_USE', ids.superAdmin]
  );
  ids.entityId = entity.rows[0].id;

  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [ids.ownerUser, ids.entityId]);
}

async function cleanup() {
  await pool.query(`DELETE FROM platform_audit_log WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [ids.superAdmin, ids.ownerUser]);
}

async function verifyZeroResidue() {
  const audit = await pool.query(`SELECT count(*)::int AS n FROM platform_audit_log WHERE entity_id = $1`, [ids.entityId]);
  const ue = await pool.query(`SELECT count(*)::int AS n FROM user_entities WHERE entity_id = $1`, [ids.entityId]);
  const ent = await pool.query(`SELECT count(*)::int AS n FROM entities WHERE id = $1`, [ids.entityId]);
  const usr = await pool.query(`SELECT count(*)::int AS n FROM users WHERE id IN ($1, $2)`, [ids.superAdmin, ids.ownerUser]);
  assert.strictEqual(audit.rows[0].n, 0, 'platform_audit_log residue');
  assert.strictEqual(ue.rows[0].n, 0, 'user_entities residue');
  assert.strictEqual(ent.rows[0].n, 0, 'entities residue');
  assert.strictEqual(usr.rows[0].n, 0, 'users residue');
}

async function main() {
  await setup();
  try {
    await check('a non-approval audit action (billing_account_create) never leaks into getApprovalStatus comment', async () => {
      await pool.query(
        `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes) VALUES ($1, $2, 'billing_account_create', $3)`,
        [ids.superAdmin, ids.entityId, 'fee_rate=0.03 vat_rate=0.18 preferred_collection_method=card']
      );
      const status = await entitiesService.getApprovalStatus(ids.entityId, ids.ownerUser);
      assert.strictEqual(status.comment, null, 'comment must be null -- no real approval-decision row exists yet');
      assert.strictEqual(status.actionBy, null);
    });

    await check('a MASAV self-service audit action also never leaks into getApprovalStatus comment', async () => {
      await pool.query(
        `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes) VALUES ($1, $2, 'masav_bank_details_upsert', $3)`,
        [ids.superAdmin, ids.entityId, 'bank=12 branch=345 account=6789012']
      );
      const status = await entitiesService.getApprovalStatus(ids.entityId, ids.ownerUser);
      assert.strictEqual(status.comment, null);
    });

    await check('a real approval-decision action (request_changes, with notes) DOES surface correctly, and wins over older/newer non-approval rows', async () => {
      await pool.query(
        `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, reason_tags) VALUES ($1, $2, 'request_changes', $3, $4)`,
        [ids.superAdmin, ids.entityId, 'חסר מסמך התאגדות', ['missing_document']]
      );
      // A newer non-approval action lands after it -- must NOT override the real decision.
      await pool.query(
        `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes) VALUES ($1, $2, 'masav_authorize', $3)`,
        [ids.superAdmin, ids.entityId, null]
      );

      const status = await entitiesService.getApprovalStatus(ids.entityId, ids.ownerUser);
      assert.strictEqual(status.status, 'active'); // entities.status itself unaffected -- separate column
      assert.strictEqual(status.comment, 'חסר מסמך התאגדות');
      assert.deepStrictEqual(status.reasonTags, ['missing_document']);
      assert.strictEqual(status.actionBy, 'ZZZ Test Super Admin');
    });
  } finally {
    await cleanup();
    await verifyZeroResidue();
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
