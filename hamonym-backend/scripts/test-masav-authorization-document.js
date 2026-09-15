// Real-DB functional test for the MASAV signed bank-authorization document
// upload (migration 063 + masav-config.service.js#uploadAuthorizationDocument/
// getAuthorizationDocumentFile) added for the MASAV setup UX work
// (2026-09-03) -- deliberately real Postgres, not a mock, so the actual
// migration 060/063 CHECK constraint and column set are proven against the
// live schema.
//
// Central claim under test: uploading the signed document is evidence only
// and must NEVER set `authorized` -- that stays exactly what it already was,
// an explicit, separate Super Admin action via authorize()/revoke(). Also
// proves getByEntityId (the ordinary config read, used by the MASAV tab and
// blocked/actionable statement lists) never returns the document bytea, only
// a has_authorization_document boolean + metadata -- the full bytes are only
// ever reachable through the dedicated getAuthorizationDocumentFile used by
// the authenticated download route.
//
// 2026-09-16: uploadAuthorizationDocument() was changed from a hard UPDATE
// (which required an entity_masav_details row to already exist -- i.e. bank
// details saved first) to an UPSERT, so the two MASAV setup pieces (bank
// details, authorization document) can now be completed in either order --
// per the Billing Setup drawer redesign's "checklist, not a wizard"
// principle. This file's first test used to assert the OLD refusal
// (MASAV_NOT_CONFIGURED); it now asserts the opposite (upload succeeds,
// creating a row with '' bank placeholders), plus new tests proving that
// path is still safe: authorize() keeps rejecting incomplete bank details
// regardless of which order the two pieces were filled in, and filling in
// real bank details afterward doesn't wipe the already-uploaded document.
//
// Everything created here is throwaway and fully deleted at the end
// (verified by re-querying): one entity, one entity_masav_details row, one
// platform_audit_log row per action, one super-admin user.
//
// Run: node scripts/test-masav-authorization-document.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const masavConfig = require('../src/modules/billing-engine/masav-config.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const RUN_TAG = `zzz-test-masav-doc-${Date.now()}`;
const ids = { superAdmin: null, entityId: null };

async function setup() {
  const admin = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, is_super_admin) VALUES (2, $1, 'ZZZ Test Super Admin', true, true) RETURNING id`,
    [`${RUN_TAG}-admin@example.invalid`]
  );
  ids.superAdmin = admin.rows[0].id;

  const entity = await pool.query(
    `INSERT INTO entities (display_name, status, created_by_user_id) VALUES ($1, 'active', $2) RETURNING id`,
    ['ZZZ_TEST_MASAV_DOC_DO_NOT_USE', ids.superAdmin]
  );
  ids.entityId = entity.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM platform_audit_log WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM entity_masav_details WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [ids.superAdmin]);
}

async function verifyZeroResidue() {
  const audit = await pool.query(`SELECT count(*)::int AS n FROM platform_audit_log WHERE entity_id = $1`, [ids.entityId]);
  const cfg = await pool.query(`SELECT count(*)::int AS n FROM entity_masav_details WHERE entity_id = $1`, [ids.entityId]);
  const ent = await pool.query(`SELECT count(*)::int AS n FROM entities WHERE id = $1`, [ids.entityId]);
  const usr = await pool.query(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [ids.superAdmin]);
  assert.strictEqual(audit.rows[0].n, 0, 'platform_audit_log residue');
  assert.strictEqual(cfg.rows[0].n, 0, 'entity_masav_details residue');
  assert.strictEqual(ent.rows[0].n, 0, 'entities residue');
  assert.strictEqual(usr.rows[0].n, 0, 'users residue');
}

async function main() {
  await setup();
  try {
    await check('uploadAuthorizationDocument: now succeeds with NO bank details configured yet -- creates a row with \'\' placeholders, never NULL (NOT NULL columns)', async () => {
      const config = await masavConfig.uploadAuthorizationDocument({
        entityId: ids.entityId,
        file: { originalname: 'early-upload.pdf', mimetype: 'application/pdf', buffer: Buffer.from('early-bytes') },
        actorUserId: ids.superAdmin,
      });
      assert.strictEqual(config.has_authorization_document, true);
      assert.strictEqual(config.authorization_document_name, 'early-upload.pdf');
      assert.strictEqual(config.bank_code, '');
      assert.strictEqual(config.branch_code, '');
      assert.strictEqual(config.account_number, '');
      assert.strictEqual(config.authorized, false);
    });

    await check('authorize() still refuses -- bank details remain incomplete even though a document is on file (partial setup stays not-ready)', async () => {
      await assert.rejects(
        () => masavConfig.authorize({ entityId: ids.entityId, superAdminUserId: ids.superAdmin }),
        (err) => err.code === 'MASAV_INCOMPLETE'
      );
    });

    await check('upsertBankDetails: filling in real bank details afterward does not wipe the already-uploaded document', async () => {
      const config = await masavConfig.upsertBankDetails({
        entityId: ids.entityId, bankCode: '12', branchCode: '345', accountNumber: '6789012',
        accountHolderName: 'ZZZ Test Account Holder', actorUserId: ids.superAdmin,
      });
      assert.strictEqual(config.authorized, false);
      assert.strictEqual(config.bank_code, '12');
      assert.strictEqual(config.has_authorization_document, true, 'document uploaded before bank details must survive upsertBankDetails');
      assert.strictEqual(config.authorization_document_name, 'early-upload.pdf');

      // Clean slate for the rest of this file's original (unchanged)
      // scenario: bank details first, then a fresh document overwrite.
      await masavConfig.authorize({ entityId: ids.entityId, superAdminUserId: ids.superAdmin });
      await masavConfig.revoke({ entityId: ids.entityId, superAdminUserId: ids.superAdmin });
    });

    await check('uploadAuthorizationDocument: still works the original way too -- bank details already exist, upload just updates document fields', async () => {
      // multer/busboy hand originalname to the app already mis-decoded as
      // latin1 for a UTF-8-encoded filename -- simulate that exact mangling
      // here (same as entities.service.js's own upload tests would need to)
      // so this proves fixFilenameEncoding's real round-trip, not a no-op.
      const mangledName = Buffer.from('הרשאה-חתומה.pdf', 'utf8').toString('latin1');
      const config = await masavConfig.uploadAuthorizationDocument({
        entityId: ids.entityId,
        file: { originalname: mangledName, mimetype: 'application/pdf', buffer: Buffer.from('%PDF-fake-bytes') },
        actorUserId: ids.superAdmin,
      });
      assert.strictEqual(config.has_authorization_document, true);
      assert.strictEqual(config.authorization_document_name, 'הרשאה-חתומה.pdf');
      assert.notStrictEqual(config.authorization_document_uploaded_at, null);
      // The central claim: uploading evidence never flips authorized.
      assert.strictEqual(config.authorized, false);
      assert.strictEqual(config.authorized_by, null);
      assert.strictEqual(config.authorized_at, null);
    });

    await check('getByEntityId (ordinary config read) never returns the document bytea, only metadata', async () => {
      const config = await masavConfig.getByEntityId(ids.entityId);
      assert.strictEqual(config.has_authorization_document, true);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(config, 'authorization_document_data'), false);
    });

    await check('getAuthorizationDocumentFile returns the real bytes/mime/name for the download route', async () => {
      const file = await masavConfig.getAuthorizationDocumentFile(ids.entityId);
      assert.strictEqual(file.name, 'הרשאה-חתומה.pdf');
      assert.strictEqual(file.mime, 'application/pdf');
      assert.strictEqual(Buffer.from(file.data).toString(), '%PDF-fake-bytes');
    });

    await check('authorize() still requires an explicit Super Admin call -- an uploaded document alone never satisfies it', async () => {
      const before = await masavConfig.getByEntityId(ids.entityId);
      assert.strictEqual(before.authorized, false, 'sanity: still unauthorized right before the explicit call');

      const config = await masavConfig.authorize({ entityId: ids.entityId, superAdminUserId: ids.superAdmin, notes: 'zzz test authorize' });
      assert.strictEqual(config.authorized, true);
      assert.strictEqual(config.authorized_by, String(ids.superAdmin));
      // The document uploaded earlier must survive authorize() untouched.
      assert.strictEqual(config.has_authorization_document, true);
    });

    await check('revoke() clears authorized but leaves the uploaded document in place (revoking authorization is not deleting evidence)', async () => {
      const config = await masavConfig.revoke({ entityId: ids.entityId, superAdminUserId: ids.superAdmin, notes: 'zzz test revoke' });
      assert.strictEqual(config.authorized, false);
      assert.strictEqual(config.authorized_by, null);
      assert.strictEqual(config.has_authorization_document, true, 'document must not be wiped by revoke()');
    });

    await check('re-uploading a document overwrites the previous one (PUT semantics), still never touches authorized', async () => {
      // authorize once more so this check also proves upload after
      // authorization does not silently revoke it either -- upload is
      // orthogonal to the authorized flag in both directions.
      await masavConfig.authorize({ entityId: ids.entityId, superAdminUserId: ids.superAdmin });

      const config = await masavConfig.uploadAuthorizationDocument({
        entityId: ids.entityId,
        file: { originalname: 'v2.pdf', mimetype: 'application/pdf', buffer: Buffer.from('second-version') },
        actorUserId: ids.superAdmin,
      });
      assert.strictEqual(config.authorization_document_name, 'v2.pdf');
      assert.strictEqual(config.authorized, true, 'uploading a replacement document must not revoke an existing authorization either');

      const file = await masavConfig.getAuthorizationDocumentFile(ids.entityId);
      assert.strictEqual(Buffer.from(file.data).toString(), 'second-version');
    });
  } finally {
    await cleanup();
    await verifyZeroResidue();
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  console.log('Fixture cleanup verified: zero residue for entity/user created by this test.');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Test run crashed:', err);
  try { await cleanup(); await verifyZeroResidue(); console.log('Cleanup completed despite crash.'); }
  catch (cleanupErr) { console.error('CLEANUP ALSO FAILED -- manual cleanup required for', ids, cleanupErr); }
  process.exit(1);
});
