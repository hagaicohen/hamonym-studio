// Real-DB regression test for the ambassador personal-link (slug) feature.
//
// Product rules under test:
//   - every ambassador gets a default personal link automatically
//   - the link is editable, in Hebrew or in English
//   - uniqueness is per CAMPAIGN (campaign_ambassadors_unique_slug), never
//     global -- the same link may exist in two different campaigns
//   - an EXPLICIT link that is taken is rejected outright, never silently
//     renamed; only an AUTO-generated default may be deduplicated
//   - an ambassador re-saving their OWN current link is not a conflict
//   - all four write paths (admin CRUD, public self-register, Ambassador
//     Studio self-edit, Campaign Builder draft sync) share ONE canonical
//     normalizer/validator
//
// Everything created here is throwaway and fully deleted at the end.
//
// Run: node scripts/test-ambassador-personal-url.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const ambSvc = require('../src/modules/ambassadors/ambassadors.service');
const campaignSvc = require('../src/modules/campaigns/campaigns.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const RUN_TAG = `zzz-amb-url-${Date.now()}`;
const SLUG_A = `${RUN_TAG}-a`;
const SLUG_B = `${RUN_TAG}-b`;

let userId, studioUserId, entityId, campaignA, campaignB;

async function makeCampaign(slug) {
  const res = await pool.query(
    `INSERT INTO campaigns (entity_id, title, slug, status, target_amount, cover_image_url, hero_type, campaign_lifecycle, published_at)
     VALUES ($1, 'ZZZ Test Ambassador URL', $2, 'published', 50000, 'https://example.test/cover.jpg', 'image', 'one-time', NOW())
     RETURNING id`,
    [entityId, slug]
  );
  return res.rows[0].id;
}

async function setup() {
  const userRes = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Amb URL Owner', true) RETURNING id`,
    [`${RUN_TAG}-owner@example.invalid`]
  );
  userId = userRes.rows[0].id;

  const studioRes = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Amb URL Studio User', true) RETURNING id`,
    [`${RUN_TAG}-studio@example.invalid`]
  );
  studioUserId = studioRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id) VALUES ('ZZZ_TEST amb-personal-url', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [userId, entityId]);

  campaignA = await makeCampaign(SLUG_A);
  campaignB = await makeCampaign(SLUG_B);
}

async function cleanup() {
  const ids = [campaignA, campaignB].filter(Boolean);
  if (ids.length) {
    await pool.query(`DELETE FROM campaign_ambassadors WHERE campaign_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM platform_audit_log WHERE campaign_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM campaigns WHERE id = ANY($1::uuid[])`, [ids]);
  }
  if (entityId) {
    await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
    await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
  }
  await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [[userId, studioUserId].filter(Boolean)]);
}

async function main() {
  await setup();

  // ─── normalization (canonical, no DB) ─────────────────────────────────────

  await check('1. normalizeSlug preserves Hebrew instead of transliterating it to ASCII', async () => {
    assert.strictEqual(ambSvc.normalizeSlug('דוד כהן'), 'דוד-כהן');
  });

  await check('2. normalizeSlug accepts English and lowercases it', async () => {
    assert.strictEqual(ambSvc.normalizeSlug('David-Cohen'), 'david-cohen');
  });

  await check('3. normalizeSlug turns spaces into hyphens and collapses runs', async () => {
    assert.strictEqual(ambSvc.normalizeSlug('  David   Cohen  '), 'david-cohen');
    assert.strictEqual(ambSvc.normalizeSlug('a---b'), 'a-b');
  });

  await check('4. normalizeSlug strips characters outside the campaign-slug charset', async () => {
    assert.strictEqual(ambSvc.normalizeSlug('David! Cohen? #1'), 'david-cohen-1');
  });

  await check('5. normalizeSlugOrThrow rejects a value that normalizes too short', async () => {
    assert.throws(() => ambSvc.normalizeSlugOrThrow('!'), /Slug too short/);
    assert.throws(() => ambSvc.normalizeSlugOrThrow(''), /Slug too short/);
  });

  // ─── admin CRUD path (ambassadors.service.js#create/#update) ──────────────

  let ambAuto, ambAutoDup, ambHebrew, ambEnglish;

  await check('6. a new ambassador with no requested link gets one generated automatically', async () => {
    ambAuto = await ambSvc.create(userId, campaignA, { full_name: 'ZZZ אוטומטי ראשון' });
    assert.ok(ambAuto.slug && ambAuto.slug.length >= 2, `expected a generated slug, got ${JSON.stringify(ambAuto.slug)}`);
    assert.strictEqual(ambAuto.slug, 'zzz-אוטומטי-ראשון', 'the generated default must come from the canonical normalizer');
  });

  await check('7. an AUTO-generated link that collides is deduplicated (no human chose it)', async () => {
    ambAutoDup = await ambSvc.create(userId, campaignA, { full_name: 'ZZZ אוטומטי ראשון' });
    assert.strictEqual(ambAutoDup.slug, 'zzz-אוטומטי-ראשון-1');
    assert.notStrictEqual(ambAutoDup.slug, ambAuto.slug);
  });

  await check('8. an explicit HEBREW link is accepted and stored normalized', async () => {
    ambHebrew = await ambSvc.create(userId, campaignA, { full_name: 'ZZZ עברית', slug: 'שרה לוי' });
    assert.strictEqual(ambHebrew.slug, 'שרה-לוי');
  });

  await check('9. an explicit ENGLISH link is accepted and stored normalized', async () => {
    ambEnglish = await ambSvc.create(userId, campaignA, { full_name: 'ZZZ English', slug: 'Sarah Levy' });
    assert.strictEqual(ambEnglish.slug, 'sarah-levy');
  });

  await check('10. an explicit link already taken IN THIS CAMPAIGN is rejected, never renamed', async () => {
    await assert.rejects(
      ambSvc.create(userId, campaignA, { full_name: 'ZZZ Thief', slug: 'שרה-לוי' }),
      /Slug taken/
    );
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM campaign_ambassadors WHERE campaign_id = $1 AND slug LIKE 'שרה-לוי%'`,
      [campaignA]
    );
    assert.strictEqual(rows[0].n, 1, 'the rejected create must not have silently inserted a renamed row');
  });

  await check('11. the SAME link is allowed in a DIFFERENT campaign (uniqueness is per campaign)', async () => {
    const other = await ambSvc.create(userId, campaignB, { full_name: 'ZZZ Other Campaign', slug: 'שרה לוי' });
    assert.strictEqual(other.slug, 'שרה-לוי');
  });

  await check('12. an ambassador re-saving their OWN current link succeeds (self-exclusion)', async () => {
    const updated = await ambSvc.update(userId, ambHebrew.id, { slug: 'שרה-לוי', personal_title: 'ZZZ same slug' });
    assert.strictEqual(updated.slug, 'שרה-לוי');
  });

  await check('13. an ambassador cannot take another ambassador link in the same campaign', async () => {
    await assert.rejects(
      ambSvc.update(userId, ambEnglish.id, { slug: 'שרה-לוי' }),
      /Slug taken/
    );
    const { rows } = await pool.query(`SELECT slug FROM campaign_ambassadors WHERE id = $1`, [ambEnglish.id]);
    assert.strictEqual(rows[0].slug, 'sarah-levy', 'the rejected update must leave the existing link untouched');
  });

  await check('14. editing a link to a free value works and is normalized on the way in', async () => {
    const updated = await ambSvc.update(userId, ambEnglish.id, { slug: 'Sarah The Runner' });
    assert.strictEqual(updated.slug, 'sarah-the-runner');
  });

  await check('15. editing other fields never disturbs the existing link', async () => {
    const updated = await ambSvc.update(userId, ambEnglish.id, { personal_title: 'ZZZ unrelated edit' });
    assert.strictEqual(updated.slug, 'sarah-the-runner');
  });

  // ─── public availability check ────────────────────────────────────────────

  await check('16. checkSlugAvailable reports a taken link as unavailable', async () => {
    const res = await ambSvc.checkSlugAvailable(SLUG_A, 'שרה לוי');
    assert.deepStrictEqual(res, { slug: 'שרה-לוי', available: false });
  });

  await check('17. checkSlugAvailable reports a free link as available', async () => {
    const res = await ambSvc.checkSlugAvailable(SLUG_A, `${RUN_TAG}-free`);
    assert.strictEqual(res.available, true);
  });

  await check('18. checkSlugAvailable honours excludeAmbassadorId (own link reads as available)', async () => {
    const res = await ambSvc.checkSlugAvailable(SLUG_A, 'שרה-לוי', ambHebrew.id);
    assert.strictEqual(res.available, true);
  });

  await check('19. checkSlugAvailable flags a too-short candidate distinctly, not as "taken"', async () => {
    const res = await ambSvc.checkSlugAvailable(SLUG_A, '!');
    assert.strictEqual(res.available, false);
    assert.strictEqual(res.reason, 'too_short');
  });

  await check('20. checkSlugAvailable on an unknown campaign is an error, not a false "taken"', async () => {
    await assert.rejects(ambSvc.checkSlugAvailable(`${RUN_TAG}-nope`, 'anything'), /Campaign not found/);
  });

  // ─── public self-registration path ────────────────────────────────────────

  await check('21. self-registration with an explicit link accepts and normalizes it', async () => {
    const res = await ambSvc.selfRegister(SLUG_A, { full_name: 'ZZZ Self Reg', slug: 'Moshe Runner' });
    assert.strictEqual(res.slug, 'moshe-runner');
  });

  await check('22. self-registration with an explicit TAKEN link is rejected server-side', async () => {
    await assert.rejects(
      ambSvc.selfRegister(SLUG_A, { full_name: 'ZZZ Self Reg Clash', slug: 'moshe-runner' }),
      /Slug taken/
    );
  });

  await check('23. self-registration with no explicit link still auto-generates one', async () => {
    const res = await ambSvc.selfRegister(SLUG_A, { full_name: 'ZZZ ללא קישור' });
    assert.strictEqual(res.slug, 'zzz-ללא-קישור');
  });

  // ─── Ambassador Studio self-edit path ─────────────────────────────────────

  await check('24. Ambassador Studio self-edit validates the link through the canonical rule', async () => {
    // updateMyAmbassadorRecord matches the signed-in user to their
    // ambassador row by email (campaign_ambassadors.user_id is an unused
    // auth.users UUID column, not users.id).
    await pool.query(
      `UPDATE campaign_ambassadors SET email = $1 WHERE id = $2`,
      [`${RUN_TAG}-studio@example.invalid`, ambAuto.id]
    );

    const updated = await campaignSvc.updateMyAmbassadorRecord(studioUserId, campaignA, { slug: 'My Studio Link' });
    assert.strictEqual(updated.slug, 'my-studio-link');

    await assert.rejects(
      campaignSvc.updateMyAmbassadorRecord(studioUserId, campaignA, { slug: 'שרה לוי' }),
      /Slug taken/
    );
    await assert.rejects(
      campaignSvc.updateMyAmbassadorRecord(studioUserId, campaignA, { slug: '!' }),
      /Slug too short/
    );

    const same = await campaignSvc.updateMyAmbassadorRecord(studioUserId, campaignA, { slug: 'my-studio-link' });
    assert.strictEqual(same.slug, 'my-studio-link', 'self-exclusion must apply on the Studio path too');
  });

  await check('25. myAmbassadorRecord exposes the campaign target as motivational context', async () => {
    const rec = await campaignSvc.myAmbassadorRecord(studioUserId, campaignA);
    assert.strictEqual(rec.campaign.target_amount, 50000);
  });


  // ─── public /{campaign-slug}/{ambassador-slug} resolution ─────────────────

  await check('26. the public personal URL resolves end to end for an English link', async () => {
    const found = await ambSvc.getBySlug(SLUG_A, 'sarah-the-runner');
    assert.ok(found, 'expected the ambassador to resolve by campaign slug + personal slug');
    assert.strictEqual(found.id, ambEnglish.id);
  });

  await check('27. the public personal URL resolves end to end for a HEBREW link', async () => {
    const found = await ambSvc.getBySlug(SLUG_A, 'שרה-לוי');
    assert.ok(found, 'a Hebrew personal link must resolve publicly');
    assert.strictEqual(found.id, ambHebrew.id);
  });

  await check('28. the same personal link in two campaigns resolves to the right ambassador in each', async () => {
    const inA = await ambSvc.getBySlug(SLUG_A, 'שרה-לוי');
    const inB = await ambSvc.getBySlug(SLUG_B, 'שרה-לוי');
    assert.ok(inA && inB, 'the shared link must resolve in BOTH campaigns');
    assert.notStrictEqual(inA.id, inB.id, 'per-campaign scoping must keep the two rows distinct');
    assert.strictEqual(inA.campaign_id, campaignA);
    assert.strictEqual(inB.campaign_id, campaignB);
  });

  await check('29. an unknown personal link resolves to nothing rather than a wrong ambassador', async () => {
    const found = await ambSvc.getBySlug(SLUG_A, `${RUN_TAG}-missing`);
    assert.strictEqual(found, null);
  });

  // ─── DB invariant ─────────────────────────────────────────────────────────

  await check('30. the DB still enforces per-campaign uniqueness independently of the app', async () => {
    await assert.rejects(
      pool.query(
        `INSERT INTO campaign_ambassadors (campaign_id, full_name, personal_message, slug)
         VALUES ($1, 'ZZZ Raw Dup', '', 'שרה-לוי')`,
        [campaignA]
      ),
      (err) => err.code === '23505'
    );
  });

  // ─── Campaign Builder draft path (the Phase 5 invariant) ──────────────────
  //
  // Last on purpose: syncAmbassadors prunes rows whose slug is absent from
  // the submitted list, so it rewrites campaignB's ambassador set.

  await check('31. Builder draft sync normalizes a raw client-supplied link (no bypass)', async () => {
    await campaignSvc.updateCampaign({
      userId,
      campaignId: campaignB,
      data: { ambassadors: [{ fullName: 'ZZZ Builder One', slug: 'Builder Raw Name!' }] },
    });
    const { rows } = await pool.query(
      `SELECT slug FROM campaign_ambassadors WHERE campaign_id = $1`,
      [campaignB]
    );
    const slugs = rows.map(r => r.slug);
    assert.ok(
      slugs.includes('builder-raw-name'),
      `Builder must persist the CANONICAL form; got ${JSON.stringify(slugs)}`
    );
    assert.ok(
      !slugs.includes('Builder Raw Name!'),
      'Builder must never persist a raw client string as a personal link'
    );
  });

  await check('32. Builder draft sync rejects two ambassadors claiming the same link', async () => {
    await assert.rejects(
      campaignSvc.updateCampaign({
        userId,
        campaignId: campaignB,
        data: {
          ambassadors: [
            { fullName: 'ZZZ Builder Dup A', slug: 'Shared Link' },
            { fullName: 'ZZZ Builder Dup B', slug: 'shared-link' },
          ],
        },
      }),
      /Slug taken/
    );
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM campaign_ambassadors WHERE campaign_id = $1 AND slug = 'shared-link'`,
      [campaignB]
    );
    assert.strictEqual(rows[0].n, 0, 'a rejected Builder save must not have partially inserted');
  });

  await check('33. Builder draft sync rejects a link that normalizes too short', async () => {
    await assert.rejects(
      campaignSvc.updateCampaign({
        userId,
        campaignId: campaignB,
        data: { ambassadors: [{ fullName: 'ZZZ Builder Short', slug: '!' }] },
      }),
      /Slug too short/
    );
  });

  await check('34. Builder draft sync re-save of an already-normalized list is idempotent', async () => {
    await campaignSvc.updateCampaign({
      userId,
      campaignId: campaignB,
      data: { ambassadors: [{ fullName: 'ZZZ Builder One Renamed', slug: 'builder-raw-name' }] },
    });
    const { rows } = await pool.query(
      `SELECT slug, full_name FROM campaign_ambassadors WHERE campaign_id = $1`,
      [campaignB]
    );
    assert.strictEqual(rows.length, 1, 'the upsert-by-slug business key must match the existing row, not duplicate it');
    assert.strictEqual(rows[0].slug, 'builder-raw-name');
    assert.strictEqual(rows[0].full_name, 'ZZZ Builder One Renamed');
  });

  await cleanup();
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
