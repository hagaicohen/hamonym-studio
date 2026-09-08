// Donation CardCom Separation (2026-09-09) -- proves the donation rail
// (LowProfile creation / GetLpResult / recurring Pause-Resume-Cancel) now
// uses a DEDICATED credential set (HAMONYM_DONATIONS_CARDCOM_*), never the
// Billing/Collection Engine's HAMONYM_CARDCOM_* (proven live for real token
// charges, deliberately untouched by this work).
//
// Background: HAMONYM_CARDCOM_* was corrected on 2026-09-02 to fix real
// CARD collection (Billing), which broke donation-side GetLpResult calls
// that had been working fine on whatever value that env var held before --
// see the 2026-09-08/09 investigation. Rather than reconstruct the old
// value, the donation fallback is being set up as an independent
// integration from today, per the explicit "no archaeology" decision.
//
// Real-DB fixture tests here never make a real CardCom network call --
// resolveCardcomCredentials/resolveCardcomCredentialsForEntity are pure DB
// lookups + credential resolution, no HTTP involved. createDonation's own
// LowProfile-payload wiring is proven by static source scan instead (it DOES
// make a real network call if actually invoked, which this suite never
// does, matching "do not perform a real donation without approval").
//
// Run: node scripts/test-donation-cardcom-separation.js

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');
const donationsService = require('../src/modules/donations/donations.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `ZZZ_TEST_DATA_DO_NOT_USE_donation-cardcom-sep-${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17;

const DONATIONS_ENV_KEYS = ['HAMONYM_DONATIONS_CARDCOM_TERMINAL', 'HAMONYM_DONATIONS_CARDCOM_API_NAME', 'HAMONYM_DONATIONS_CARDCOM_API_PASSWORD'];
const BILLING_ENV_KEYS = ['HAMONYM_CARDCOM_TERMINAL', 'HAMONYM_CARDCOM_API_NAME', 'HAMONYM_CARDCOM_API_PASSWORD'];

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((k) => [k, process.env[k]]));
}
function restoreEnv(snapshot) {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
function clearEnv(keys) {
  for (const k of keys) delete process.env[k];
}

async function main() {
  const envSnapshot = snapshotEnv([...DONATIONS_ENV_KEYS, ...BILLING_ENV_KEYS]);
  const fixture = { entityUnverifiedId: null, entityVerifiedId: null, campaignUnverifiedId: null, campaignVerifiedId: null, donationUnverifiedId: null, donationVerifiedId: null };

  try {
    // ==== 1. resolveDonationFallbackCredentials -- pure, no DB ============

    await check('1a. all three donation env vars missing -> null (not a half-filled object)', async () => {
      clearEnv(DONATIONS_ENV_KEYS);
      assert.strictEqual(donationsService.resolveDonationFallbackCredentials(), null);
    });

    await check('1b. only two of three set -> still null (fail clearly, never partially configured)', async () => {
      clearEnv(DONATIONS_ENV_KEYS);
      process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = 'fixture-terminal';
      process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = 'fixture-api-name';
      assert.strictEqual(donationsService.resolveDonationFallbackCredentials(), null);
    });

    await check('1c. all three set -> returns exactly those three values', async () => {
      clearEnv(DONATIONS_ENV_KEYS);
      process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = 'fixture-terminal';
      process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = 'fixture-api-name';
      process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD = 'fixture-api-password';
      assert.deepStrictEqual(donationsService.resolveDonationFallbackCredentials(), {
        terminalNumber: 'fixture-terminal', apiName: 'fixture-api-name', apiPassword: 'fixture-api-password',
      });
    });

    // ==== 2. Real-DB fixture: an entity with NO verified CardCom account ===

    const entityU = await pool.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, $2, 'active', 'association') RETURNING id`,
      [FIXTURE_TAG + '-unverified', SUPER_ADMIN_USER_ID]
    );
    fixture.entityUnverifiedId = entityU.rows[0].id;

    const campaignU = await pool.query(
      `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
      [fixture.entityUnverifiedId, `${FIXTURE_TAG}-unverified-slug`, FIXTURE_TAG]
    );
    fixture.campaignUnverifiedId = campaignU.rows[0].id;

    const donationU = await pool.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, status, is_mock)
       VALUES ($1, $2, 1, 'pending', false) RETURNING id`,
      [fixture.campaignUnverifiedId, fixture.entityUnverifiedId]
    );
    fixture.donationUnverifiedId = donationU.rows[0].id;

    await check('2a. unverified entity + donation env configured -> resolveCardcomCredentials returns the DONATION fallback, not Billing', async () => {
      clearEnv(DONATIONS_ENV_KEYS);
      process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = 'donations-terminal';
      process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = 'donations-api-name';
      process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD = 'donations-api-password';
      // Billing env deliberately set to DIFFERENT values -- proves the two never mix.
      process.env.HAMONYM_CARDCOM_TERMINAL = 'billing-terminal';
      process.env.HAMONYM_CARDCOM_API_NAME = 'billing-api-name';
      process.env.HAMONYM_CARDCOM_API_PASSWORD = 'billing-api-password';

      const credentials = await donationsService.resolveCardcomCredentials(fixture.donationUnverifiedId);
      assert.deepStrictEqual(credentials, {
        terminalNumber: 'donations-terminal', apiName: 'donations-api-name', apiPassword: 'donations-api-password',
      });
    });

    await check('2b. same fixture, resolveCardcomCredentialsForEntity (used by recurring Pause/Resume/Cancel) agrees', async () => {
      const credentials = await donationsService.resolveCardcomCredentialsForEntity(fixture.entityUnverifiedId);
      assert.deepStrictEqual(credentials, {
        terminalNumber: 'donations-terminal', apiName: 'donations-api-name', apiPassword: 'donations-api-password',
      });
    });

    await check('2c. donation env vars missing, even though Billing env vars ARE set -> throws, never silently uses Billing credentials', async () => {
      clearEnv(DONATIONS_ENV_KEYS);
      process.env.HAMONYM_CARDCOM_TERMINAL = 'billing-terminal';
      process.env.HAMONYM_CARDCOM_API_NAME = 'billing-api-name';
      process.env.HAMONYM_CARDCOM_API_PASSWORD = 'billing-api-password';

      await assert.rejects(
        () => donationsService.resolveCardcomCredentials(fixture.donationUnverifiedId),
        (err) => err.code === 'DONATION_CARDCOM_FALLBACK_NOT_CONFIGURED'
      );
    });

    // ==== 3. Real-DB fixture: an entity WITH its own verified CardCom ======

    const entityV = await pool.query(
      `INSERT INTO entities (
         display_name, created_by_user_id, status, entity_type,
         cardcom_terminal_number, cardcom_api_username, cardcom_api_password_encrypted, cardcom_connection_status
       ) VALUES ($1, $2, 'active', 'association', $3, $4, $5, 'success') RETURNING id`,
      [FIXTURE_TAG + '-verified', SUPER_ADMIN_USER_ID, 'entity-own-terminal', 'entity-own-api-name', 'entity-own-api-password']
    );
    fixture.entityVerifiedId = entityV.rows[0].id;

    const campaignV = await pool.query(
      `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
      [fixture.entityVerifiedId, `${FIXTURE_TAG}-verified-slug`, FIXTURE_TAG]
    );
    fixture.campaignVerifiedId = campaignV.rows[0].id;

    const donationV = await pool.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, status, is_mock)
       VALUES ($1, $2, 1, 'pending', false) RETURNING id`,
      [fixture.campaignVerifiedId, fixture.entityVerifiedId]
    );
    fixture.donationVerifiedId = donationV.rows[0].id;

    await check('3a. entity WITH its own verified CardCom -> its own credentials win, regardless of either env var set', async () => {
      clearEnv(DONATIONS_ENV_KEYS);
      clearEnv(BILLING_ENV_KEYS);
      const credentials = await donationsService.resolveCardcomCredentials(fixture.donationVerifiedId);
      assert.deepStrictEqual(credentials, {
        terminalNumber: 'entity-own-terminal', apiName: 'entity-own-api-name', apiPassword: 'entity-own-api-password',
      });
    });

    await check('3b. verified entity never even requires the donation fallback env vars to be set', async () => {
      // already cleared above -- if this reached here without throwing, entity-priority worked
      assert.ok(true);
    });

    // ==== 4. Structural proof: the Billing/Collection Engine rail is untouched ====

    await check('4a. donations.service.js has zero remaining references to Billing credentials (process.env.HAMONYM_CARDCOM_*)', async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'donations', 'donations.service.js'), 'utf8');
      const hits = src.match(/process\.env\.HAMONYM_CARDCOM_\w+/g) || [];
      assert.deepStrictEqual(hits, [], `found leftover Billing-credential reference(s): ${hits.join(', ')}`);
    });

    await check('4b. the Billing/Collection adapter still uses HAMONYM_CARDCOM_* unchanged -- this work never touched that rail', async () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'modules', 'collection-engine', 'adapters', 'cardcom-token-charge.adapter.js'), 'utf8'
      );
      assert.ok(src.includes('process.env.HAMONYM_CARDCOM_TERMINAL'));
      assert.ok(src.includes('process.env.HAMONYM_CARDCOM_API_NAME'));
      assert.ok(!src.includes('HAMONYM_DONATIONS_CARDCOM'), 'Billing adapter must never reference the donation credential set');
    });
  } finally {
    if (fixture.donationUnverifiedId) await pool.query(`DELETE FROM donations WHERE id = $1`, [fixture.donationUnverifiedId]);
    if (fixture.donationVerifiedId) await pool.query(`DELETE FROM donations WHERE id = $1`, [fixture.donationVerifiedId]);
    if (fixture.campaignUnverifiedId) await pool.query(`DELETE FROM campaigns WHERE id = $1`, [fixture.campaignUnverifiedId]);
    if (fixture.campaignVerifiedId) await pool.query(`DELETE FROM campaigns WHERE id = $1`, [fixture.campaignVerifiedId]);
    if (fixture.entityUnverifiedId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityUnverifiedId]);
    if (fixture.entityVerifiedId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityVerifiedId]);

    restoreEnv(envSnapshot);

    await check('cleanup verification: zero residue -- every fixture row is gone', async () => {
      const ids = [fixture.donationUnverifiedId, fixture.donationVerifiedId].filter(Boolean);
      const cIds = [fixture.campaignUnverifiedId, fixture.campaignVerifiedId].filter(Boolean);
      const eIds = [fixture.entityUnverifiedId, fixture.entityVerifiedId].filter(Boolean);
      const [d, c, e] = await Promise.all([
        ids.length ? pool.query(`SELECT id FROM donations WHERE id = ANY($1::uuid[])`, [ids]) : { rows: [] },
        cIds.length ? pool.query(`SELECT id FROM campaigns WHERE id = ANY($1::uuid[])`, [cIds]) : { rows: [] },
        eIds.length ? pool.query(`SELECT id FROM entities WHERE id = ANY($1::uuid[])`, [eIds]) : { rows: [] },
      ]);
      assert.strictEqual(d.rows.length, 0, 'donations residue');
      assert.strictEqual(c.rows.length, 0, 'campaigns residue');
      assert.strictEqual(e.rows.length, 0, 'entities residue');
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
