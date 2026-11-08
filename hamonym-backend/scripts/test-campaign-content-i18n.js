// Bilingual campaign content (migration 088) — no database, no network: the db
// module is replaced by a scripted fake before anything loads it.
//   node scripts/test-campaign-content-i18n.js
const assert = require('assert');
const path = require('path');

const queries = [];
let columnExists = true;
let campaignRow = {};
const fakeDb = {
  query: async (sql, params = []) => {
    queries.push({ sql, params });
    if (/information_schema\.columns/.test(sql)) return { rows: columnExists ? [{ '?column?': 1 }] : [] };
    if (/FROM campaigns c\s+JOIN entities e ON e\.id = c\.entity_id\s+WHERE c\.id = \$1/.test(sql)) {
      return { rows: [{ entity_id: 'e1', is_locked: false, title: 'קמפיין', slug: 's', published_at: null, layout: {}, entity_status: 'active' }] };
    }
    if (/FROM user_entities/.test(sql)) return { rows: [{ '?column?': 1 }] };
    if (/^\s*UPDATE campaigns/.test(sql)) return { rows: [{ id: 'c1', entity_id: 'e1' }] };
    if (/FROM registration_options/.test(sql)) return { rows: [] };
    if (/WHERE c\.slug = \$1 AND c\.status = 'published'/.test(sql)) return { rows: [{ ...campaignRow }] };
    return { rows: [] };
  },
  connect: async () => ({ query: fakeDb.query, release() {} }),
};
const dbPath = require.resolve(path.join(__dirname, '../src/db/db'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
const dashPath = require.resolve(path.join(__dirname, '../src/modules/dashboard/dashboard.service'));
require.cache[dashPath] = { id: dashPath, filename: dashPath, loaded: true, exports: { invalidateDashboard() {} } };

const { validateContentI18n, publicContentI18n } = require('../src/modules/campaigns/content-i18n');
const service = require('../src/modules/campaigns/campaigns.service');

let passed = 0;
const test = async (name, fn) => {
  queries.length = 0;
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

(async () => {
  const EN = { v: 1, en: { published: false, values: { title: 'Our campaign', 'blocks#b1.data.content': '<p>Hello</p>' } } };

  await test('valid overlay is kept as is', () => {
    assert.deepStrictEqual(validateContentI18n(EN), EN);
    assert.strictEqual(validateContentI18n(null), null);
    assert.deepStrictEqual(validateContentI18n({ v: 1 }), { v: 1 });
  });

  await test('malformed overlays are refused', () => {
    for (const bad of [[], 'x', { v: 2 }, { v: 1, en: [] }, { v: 1, en: { published: 'yes', values: {} } },
      { v: 1, en: { published: false, values: { title: 5 } } }, { v: 1, en: { published: false, values: { 'bad path!': 'x' } } },
      { v: 1, en: { published: false, values: { title: 'x'.repeat(100001) } } }]) {
      assert.throws(() => validateContentI18n(bad), /Invalid campaign translations/, JSON.stringify(bad).slice(0, 60));
    }
  });

  await test('English cannot be published without an English title', () => {
    assert.throws(() => validateContentI18n({ v: 1, en: { published: true, values: { 'blocks#b1.label': 'x' } } }), /English title is required/);
    assert.ok(validateContentI18n({ v: 1, en: { published: true, values: { title: 'T' } } }));
  });

  await test('public response hides an unpublished English version', () => {
    assert.strictEqual(publicContentI18n(null), null);
    assert.strictEqual(publicContentI18n(EN), null);
    const pub = { v: 1, en: { published: true, values: { title: 'T' } } };
    assert.deepStrictEqual(publicContentI18n(pub), pub);
  });

  await test('PATCH stores content_i18n as JSON next to the Hebrew columns', async () => {
    columnExists = true;
    await service.updateCampaign({ userId: 1, campaignId: 'c1', data: { title: 'קמפיין', content_i18n: EN } });
    const update = queries.find((q) => /^\s*UPDATE campaigns/.test(q.sql));
    assert.ok(/content_i18n = \$2/.test(update.sql), update.sql);
    assert.strictEqual(update.params[0], 'קמפיין');
    assert.deepStrictEqual(JSON.parse(update.params[1]), EN);
  });

  await test('PATCH without content_i18n leaves the column untouched', async () => {
    await service.updateCampaign({ userId: 1, campaignId: 'c1', data: { title: 'קמפיין' } });
    const update = queries.find((q) => /^\s*UPDATE campaigns/.test(q.sql));
    assert.ok(!/content_i18n/.test(update.sql));
    assert.ok(!queries.some((q) => /information_schema/.test(q.sql)));
  });

  await test('before migration 088 the translations are dropped and the save still succeeds', async () => {
    columnExists = false;
    const modPath = require.resolve('../src/modules/campaigns/content-i18n');
    delete require.cache[modPath];
    const svcPath = require.resolve('../src/modules/campaigns/campaigns.service');
    delete require.cache[svcPath];
    const fresh = require('../src/modules/campaigns/campaigns.service');
    await fresh.updateCampaign({ userId: 1, campaignId: 'c1', data: { title: 'קמפיין', content_i18n: EN } });
    const update = queries.find((q) => /^\s*UPDATE campaigns/.test(q.sql));
    assert.ok(!/content_i18n/.test(update.sql), update.sql);
    columnExists = true;
  });

  await test('an invalid overlay fails the save before any UPDATE', async () => {
    await assert.rejects(service.updateCampaign({ userId: 1, campaignId: 'c1', data: { content_i18n: { v: 9 } } }), /Invalid campaign translations/);
    assert.ok(!queries.some((q) => /^\s*UPDATE campaigns/.test(q.sql)));
  });

  await test('public slug endpoint strips the unpublished English version', async () => {
    campaignRow = { id: 'c1', title: 'קמפיין', content_i18n: EN, is_locked: false };
    const draftOnly = await service.getCampaignBySlugPublic('s');
    assert.strictEqual(draftOnly.content_i18n, null);
    assert.strictEqual(draftOnly.title, 'קמפיין');
    campaignRow = { id: 'c1', title: 'קמפיין', content_i18n: { v: 1, en: { published: true, values: { title: 'T' } } } };
    const live = await service.getCampaignBySlugPublic('s');
    assert.strictEqual(live.content_i18n.en.values.title, 'T');
    campaignRow = { id: 'c1', title: 'קמפיין' };
    const before = await service.getCampaignBySlugPublic('s');
    assert.ok(!('content_i18n' in before));
  });

  // ── Registration option identity (088) ──
  await test('registration options are saved with their client uid, and only a clean one', async () => {
    columnExists = true;
    await service.updateCampaign({ userId: 1, campaignId: 'c1', data: { title: 'קמפיין', registration_options: [
      { key: 'R5', title: '5 ק"מ', price: 50, uid: 'ro1abc' },
      { key: 'R10', title: '10 ק"מ', price: 80, uid: 'bad uid!' },
    ] } });
    const inserts = queries.filter((q) => /INSERT INTO registration_options/.test(q.sql));
    assert.strictEqual(inserts.length, 2);
    assert.ok(/client_uid/.test(inserts[0].sql));
    assert.strictEqual(inserts[0].params[6], 'ro1abc');
    assert.strictEqual(inserts[1].params[6], null);
  });

  // ── Donor language (089) ──
  const donorLanguage = require('../src/modules/donations/donor-language');
  await test('a Hebrew donation writes nothing; an English one records en', async () => {
    await donorLanguage.recordDonorLanguage('d1', 'he');
    assert.ok(!queries.some((q) => /UPDATE donations SET donor_language/.test(q.sql)));
    await donorLanguage.recordDonorLanguage('d1', 'en');
    const u = queries.find((q) => /UPDATE donations SET donor_language = 'en'/.test(q.sql));
    assert.deepStrictEqual(u.params, ['d1']);
    assert.strictEqual(donorLanguage.normalizeLanguage('fr'), 'he');
  });

  await test('CardCom pages stay Hebrew unless the flag is on', () => {
    delete process.env.CARDCOM_ENGLISH_PAGES_ENABLED;
    assert.strictEqual(donorLanguage.cardcomPageLanguage('en'), 'he');
    process.env.CARDCOM_ENGLISH_PAGES_ENABLED = 'true';
    assert.strictEqual(donorLanguage.cardcomPageLanguage('en'), 'en');
    assert.strictEqual(donorLanguage.cardcomPageLanguage('he'), 'he');
    delete process.env.CARDCOM_ENGLISH_PAGES_ENABLED;
  });

  // ── Donor emails ──
  const templates = require('../src/modules/email/templates');
  await test('recurring failure email: Hebrew by default, English for an English donor', () => {
    const data = { donorName: 'Dana', campaignTitle: 'Our campaign', entityName: null, amount: 100, failedAtDisplay: '01/11/2026', supportEmail: null };
    const he = templates['recurring-payment-failed'](data);
    assert.ok(/לא בוצע/.test(he.subject) && /dir="rtl"/.test(he.html));
    const en = templates['recurring-payment-failed']({ ...data, lang: 'en' });
    assert.ok(/was not charged/.test(en.subject) && /dir="ltr"/.test(en.html) && /₪100/.test(en.text));
    assert.ok(!/[֐-׿]/.test(en.subject + en.text), 'no Hebrew left in the English email');
  });

  await test('donor verification email follows the requested language', () => {
    const he = templates['verify-donor-email']({ verificationUrl: 'https://x/y?a=1&b=2' });
    assert.ok(/[֐-׿]/.test(he.subject));
    const en = templates['verify-donor-email']({ verificationUrl: 'https://x/y?a=1&b=2', lang: 'en' });
    assert.ok(/Verify/.test(en.subject) && /a=1&amp;b=2/.test(en.html));
  });

  console.log(`\n${passed} passed`);
})().catch((err) => { console.error(err); process.exit(1); });
