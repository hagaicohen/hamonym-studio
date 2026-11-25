// Multi-currency donations (migration 087) -- isolated PostgreSQL clone + fixture
// CardCom and Bank of Israel responses. Never loads dotenv, never reaches a real
// provider (all HTTPS is refused), never touches a shared database.
// Run: node scripts/test-multi-currency-donations-postgres.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

for (const key of Object.keys(process.env)) if (/CARDCOM|DATABASE_URL|SUPABASE|DB_|EMAIL_|JWT_SECRET|HAMONYM_/.test(key)) delete process.env[key];
const TEMPLATE_SCHEMA = process.env.MC_TEMPLATE || 'hamonym_cat_masav_20261103';
const TEMPLATE_DATA = process.env.MC_TEMPLATE_DATA || 'hamonym_remove_mock_integration_20261029';
const DB_NAME = `hamonym_multicurrency_test_${Date.now()}`;
const DATA_DB = `${DB_NAME}_data`;
assert.match(DB_NAME, /^hamonym_multicurrency_test_\d+$/);
Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '5433', DB_NAME, DB_USER: 'postgres', DB_PASSWORD: 'testpass', DB_SSL: 'false',
  BACKEND_URL: 'http://localhost:3000', FRONTEND_URL: 'http://localhost:4200', CARDCOM_WEBHOOK_SECRET: 'test-secret' });
require('node:https').request = () => { throw new Error('External HTTPS forbidden'); };

// ── Fixtures ───────────────────────────────────────────────────────────────
const axios = require('axios');
const created = [];          // LowProfile/Create payloads
const lp = new Map();        // LowProfileId -> { Amount, CoinId, ReturnValue }
const recurringPosts = [];   // RecurringPayment.aspx bodies
const boi = { down: false, calls: 0, rows: {} };
axios.defaults.adapter = async config => {
  const url = new URL(config.url, config.baseURL);
  let data, status = 200;
  if (url.hostname === 'edge.boi.gov.il') {
    boi.calls++;
    if (boi.down) throw Object.assign(new Error('fixture: BoI unreachable'), { code: 'ECONNREFUSED' });
    const series = url.pathname.split('/').pop();
    const start = config.params.startperiod, end = config.params.endperiod;
    const rows = (boi.rows[series] || []).filter(([d]) => d >= start && d <= end);
    data = ['SERIES_CODE,FREQ,BASE_CURRENCY,COUNTER_CURRENCY,UNIT_MEASURE,DATA_TYPE,DATA_SOURCE,TIME_COLLECT,CONF_STATUS,PUB_WEBSITE,UNIT_MULT,COMMENTS,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS',
      ...rows.map(([d, v, mult = '0']) => `${series},D,${series.slice(4, 7)},ILS,ILS,OF00,BOI_MRKT,V,F,Y,${mult},,${d},${v},YP`)].join('\n');
  } else if (url.pathname.endsWith('/LowProfile/Create')) {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    created.push(body);
    const id = crypto.randomUUID();
    lp.set(id, { ReturnValue: body.ReturnValue, Amount: body.Amount, CoinId: body.ISOCoinId ?? 1 });
    data = { ResponseCode: 0, LowProfileId: id, Url: 'https://example.invalid/pay' };
  } else if (url.pathname.endsWith('/LowProfile/GetLpResult')) {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const entry = lp.get(body.LowProfileId);
    data = { ResponseCode: 0, LowProfileId: body.LowProfileId, ReturnValue: entry.ReturnValue, TranzactionId: Math.floor(Math.random() * 1e9),
      TranzactionInfo: { ResponseCode: 0, Amount: entry.Amount, CoinId: entry.CoinId } };
  } else if (url.pathname === '/interface/RecurringPayment.aspx') {
    recurringPosts.push(new URLSearchParams(config.data));
    data = `ResponseCode=0&AccountId=${700 + recurringPosts.length}&Recurring0.RecurringId=${5500 + recurringPosts.length}`;
  } else throw new Error('Unexpected external call in isolated test: ' + url.href);
  return { data, status, statusText: 'OK', headers: {}, config };
};

// ── Helpers ────────────────────────────────────────────────────────────────
const pg = require('pg');
const admin = new pg.Pool({ host: '127.0.0.1', port: 5433, user: 'postgres', password: 'testpass', database: 'postgres' });
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS', name); }
const migration = fs.readFileSync(path.join(root, 'migrations/087_donation_multi_currency.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'scripts/rollback-087-donation-multi-currency.sql'), 'utf8');
const israelToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = iso => new Date(`${iso}T00:00:00Z`).getUTCDay();
// Business days (Sun-Fri style: skip Saturday and, like BoI, Friday-less weeks are not modelled) for the fixture.
function fixtureRows(base, step) {
  const rows = []; const today = israelToday();
  for (let i = 12; i >= 0; i--) { const d = addDays(today, -i); if (weekday(d) === 6 || weekday(d) === 5 && i > 7) continue; rows.push([d, (base + step * i).toFixed(4)]); }
  return rows;
}
function expectedRate(series, forDate) { return boi.rows[series].filter(([d]) => d < forDate).at(-1); }

(async () => {
  let pool;
  try {
    await admin.query(`CREATE DATABASE ${DB_NAME} TEMPLATE ${TEMPLATE_SCHEMA}`);
    await admin.query(`CREATE DATABASE ${DATA_DB} TEMPLATE ${TEMPLATE_DATA}`);
    await admin.query(`DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END$$`);

    // ── Migration on a copy with real ILS history ─────────────────────────
    const data = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', password: 'testpass', database: DATA_DB });
    await data.connect();
    await check('migration keeps every historical ILS donation: amount_ils = amount, totals identical, updated_at untouched', async () => {
      const before = (await data.query(`SELECT count(*)::int n, sum(amount)::text s, md5(string_agg(id::text||amount::text||status||coalesce(updated_at::text,''), ',' ORDER BY id)) h FROM donations`)).rows[0];
      await data.query(migration);
      const after = (await data.query(`SELECT count(*)::int n, sum(amount_ils)::text s, md5(string_agg(id::text||amount::text||status||coalesce(updated_at::text,''), ',' ORDER BY id)) h,
        count(*) FILTER (WHERE currency='ILS' AND fx_status='not_required' AND fx_rate=1 AND amount_ils=amount)::int ok FROM donations`)).rows[0];
      assert.ok(before.n > 0);
      assert.equal(after.n, before.n); assert.equal(after.ok, before.n); assert.equal(after.s, before.s); assert.equal(after.h, before.h);
    });
    await check('paid-donation immutability still holds after the migration', async () => {
      const paid = (await data.query(`SELECT id FROM donations WHERE status='paid' LIMIT 1`)).rows[0];
      await assert.rejects(data.query(`UPDATE donations SET amount = amount + 1 WHERE id=$1`, [paid.id]), /frozen once paid/);
      await assert.rejects(data.query(`UPDATE donations SET currency = 'USD' WHERE id=$1`, [paid.id]), /currency cannot change/);
    });
    await check('rollback restores the pre-087 shape, and refuses while a non-ILS record exists', async () => {
      const d = (await data.query(`SELECT campaign_id, entity_id FROM donations LIMIT 1`)).rows[0];
      const { rows: [fx] } = await data.query(`INSERT INTO donations (campaign_id, entity_id, amount, rewards, status, currency) VALUES ($1,$2,10,'[]','pending','USD') RETURNING id`, [d.campaign_id, d.entity_id]);
      await assert.rejects(data.query(rollback), /non-ILS records exist/);
      await data.query('ROLLBACK').catch(() => {});
      await data.query(`DELETE FROM donations WHERE id=$1`, [fx.id]);
      await data.query(rollback);
      const cols = (await data.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='donations' AND column_name IN ('currency','amount_ils','fx_status')`)).rows[0];
      assert.equal(cols.n, 0);
      assert.equal((await data.query(`SELECT to_regclass('public.exchange_rate_resolutions') r`)).rows[0].r, null);
    });
    await data.end();

    // ── Application against the schema clone ───────────────────────────────
    pool = new pg.Pool({ host: '127.0.0.1', port: 5433, user: 'postgres', password: 'testpass', database: DB_NAME });
    // The schema template was restored without migration 077's private schema,
    // which the existing campaign_reset_block_replay trigger reads; recreate
    // its two tables (empty, exactly as 077 defines them) in this copy only.
    await pool.query(`CREATE SCHEMA IF NOT EXISTS campaign_reset_private;
      CREATE TABLE IF NOT EXISTS campaign_reset_private.backups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL,
        snapshot_sha256 text NOT NULL, snapshot jsonb NOT NULL, actor_id bigint NOT NULL, reason text NOT NULL, external_backup text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS campaign_reset_private.retired_records (table_name text NOT NULL, row_id text NOT NULL, entity_id uuid, campaign_id uuid, provider text,
        provider_reference text, low_profile_id text, backup_id uuid NOT NULL REFERENCES campaign_reset_private.backups(id), PRIMARY KEY(table_name,row_id));`);
    await pool.query(migration);
    boi.rows.RER_USD_ILS = fixtureRows(3.1, 0.005);
    boi.rows.RER_EUR_ILS = fixtureRows(3.5, 0.004);

    const { rows: [user] } = await pool.query(`INSERT INTO users (role_id, email) VALUES (1, 'owner@example.test') RETURNING id`);
    const { rows: [entity] } = await pool.query(`INSERT INTO entities (display_name, created_by_user_id, entity_type, status, cardcom_terminal_number, cardcom_api_username, cardcom_api_password_encrypted, cardcom_connection_status)
      VALUES ('עמותת בדיקה', $1, 'association', 'active', '1000', 'api', 'secret', 'success') RETURNING id`, [user.id]);
    const newCampaign = async () => (await pool.query(`INSERT INTO campaigns (entity_id, slug, title, status, rewards) VALUES ($1, $2, 'קמפיין', 'published', $3) RETURNING id`,
      [entity.id, 'mc-' + crypto.randomUUID().slice(0, 8), JSON.stringify([{ id: 'r1', title: 'תשורה', minimumAmount: 50, stock: null }])])).rows[0].id;
    const campaignId = await newCampaign();

    const money = require(root + '/src/modules/currency/money');
    const fxService = require(root + '/src/modules/currency/exchange-rate.service');
    const config = require(root + '/src/modules/currency/currency.config');
    const donations = require(root + '/src/modules/donations/donations.service');
    const paymentHandler = require(root + '/src/modules/payment/handlers/payment.handler');
    const donor = { name: 'תורם', email: 'donor@example.test', phone: '0500000000' };
    const enableFx = (recurring = false) => Object.assign(process.env, { HAMONYM_FX_DONATIONS_ENABLED: 'true', HAMONYM_FX_BILLING_POLICY_CONFIRMED: 'true', ...(recurring ? { HAMONYM_FX_RECURRING_ENABLED: 'true' } : {}) });
    const disableFx = () => { delete process.env.HAMONYM_FX_DONATIONS_ENABLED; delete process.env.HAMONYM_FX_BILLING_POLICY_CONFIRMED; delete process.env.HAMONYM_FX_RECURRING_ENABLED; };
    const row = async id => (await pool.query(`SELECT * FROM donations WHERE id=$1`, [id])).rows[0];
    const campaign = async id => (await pool.query(`SELECT current_amount::text, supporters_count FROM campaigns WHERE id=$1`, [id])).rows[0];
    const lowProfileOf = async id => (await row(id)).low_profile_id;
    const pay = async id => paymentHandler.handle({ ReturnValue: String(id), LowProfileId: await lowProfileOf(id) });

    // ── Money ───────────────────────────────────────────────────────────────
    await check('decimal-safe ILS equivalent: exact, half away from zero, never floats', async () => {
      assert.equal(money.ilsEquivalent('100', '3.194'), '319.40');
      assert.equal(money.ilsEquivalent('0.05', '1.5'), '0.08');
      assert.equal(money.ilsEquivalent('33.33', '3.157'), '105.22');
      assert.equal(money.ilsEquivalent(0.1, '3'), '0.30');
      assert.throws(() => money.toMinorUnits(12.345), /Invalid amount/);
      assert.throws(() => money.ilsEquivalent('1', '0'), /Invalid exchange rate/);
    });
    await check('the application rounding equals PostgreSQL ROUND(amount * rate, 2) on 500 random cases', async () => {
      const cases = Array.from({ length: 500 }, () => [(crypto.randomInt(1, 10000000) / 100).toFixed(2), (crypto.randomInt(1, 9999999) / 1000000 + crypto.randomInt(0, 9)).toFixed(6)]);
      const { rows } = await pool.query(`SELECT ROUND(a::numeric * r::numeric, 2)::text v FROM unnest($1::text[], $2::text[]) AS t(a, r)`, [cases.map(c => c[0]), cases.map(c => c[1])]);
      rows.forEach((r, i) => assert.equal(money.ilsEquivalent(cases[i][0], cases[i][1]), r.v, `${cases[i]}`));
    });

    // ── Exchange rates ──────────────────────────────────────────────────────
    await check('representative rate = latest BoI rate published before the payment date; weekends/holidays fall back', async () => {
      const today = israelToday();
      const r = await fxService.rateFor('USD', today);
      const [d, v] = expectedRate('RER_USD_ILS', today);
      assert.equal(r.rateDate, d); assert.equal(Number(r.rate), Number(v)); assert.equal(r.source, 'boi_representative');
      // A Saturday payment uses Friday's (or Thursday's) rate, never its own day.
      const picked = fxService.pickRate('SERIES_CODE,UNIT_MULT,TIME_PERIOD,OBS_VALUE\nRER_USD_ILS,0,2026-11-05,3.167\nRER_USD_ILS,0,2026-11-06,3.194\nRER_USD_ILS,0,2026-11-08,3.2', 'RER_USD_ILS', '2026-11-08');
      assert.deepEqual(picked, { rateDate: '2026-11-06', rate: '3.194' });
    });
    await check('unexpected unit multiplier, stale data and future dates are refused, not guessed', async () => {
      assert.throws(() => fxService.pickRate('SERIES_CODE,UNIT_MULT,TIME_PERIOD,OBS_VALUE\nRER_USD_ILS,2,2026-11-05,3.1', 'RER_USD_ILS', '2026-11-06'), e => e.reason === 'unexpected_unit_multiplier');
      assert.throws(() => fxService.pickRate('SERIES_CODE,UNIT_MULT,TIME_PERIOD,OBS_VALUE\nRER_USD_ILS,0,2026-10-20,3.1', 'RER_USD_ILS', '2026-11-06'), e => e.reason === 'published_rate_too_old');
      await assert.rejects(fxService.rateFor('USD', addDays(israelToday(), 2)), e => e.reason === 'date_in_future');
    });
    await check('provider outage: FX_RATE_UNAVAILABLE, no invented or reused rate; a resolved date is served from the stored resolution', async () => {
      const svc = fxService.createExchangeRateService();
      const forDate = addDays(israelToday(), -1);
      boi.down = true;
      await assert.rejects(svc.rateFor('EUR', forDate), e => e.code === 'FX_RATE_UNAVAILABLE' && e.reason === 'provider_unreachable');
      boi.down = false;
      const first = await svc.rateFor('EUR', forDate);
      const calls = boi.calls;
      boi.down = true;
      const again = await fxService.createExchangeRateService().rateFor('EUR', forDate);
      assert.deepEqual(again, first); assert.equal(boi.calls, calls);
      boi.down = false;
      await assert.rejects(pool.query(`UPDATE exchange_rate_resolutions SET rate = rate + 1`), /immutable/);
    });

    // ── Configuration ───────────────────────────────────────────────────────
    await check('foreign currencies are off by default and need both the provider and the FIN-11 policy switch', async () => {
      disableFx();
      assert.deepEqual(config.availability(), { currencies: ['ILS'], recurringCurrencies: ['ILS'] });
      process.env.HAMONYM_FX_DONATIONS_ENABLED = 'true';
      assert.deepEqual(config.availability().currencies, ['ILS'], 'without the billing policy');
      enableFx();
      assert.deepEqual(config.availability(), { currencies: ['ILS', 'USD', 'EUR'], recurringCurrencies: ['ILS'] });
      enableFx(true);
      assert.deepEqual(config.availability().recurringCurrencies, ['ILS', 'USD', 'EUR']);
      assert.equal(config.coinIdFor('ILS'), 1); assert.equal(config.coinIdFor('USD'), 2); assert.equal(config.coinIdFor('EUR'), 978);
      disableFx();
    });

    // ── Checkout ────────────────────────────────────────────────────────────
    let ilsId;
    await check('ILS checkout is unchanged: no ISOCoinId sent, donation stored as ILS', async () => {
      const res = await donations.createDonation({ campaignId, donor, amount: 180 });
      ilsId = res.donationId;
      const payload = created.at(-1);
      assert.equal('ISOCoinId' in payload, false); assert.equal(payload.Amount, 180);
      const d = await row(ilsId);
      assert.equal(d.currency, 'ILS'); assert.equal(d.amount_ils, '180.00'); assert.equal(d.fx_status, 'not_required');
    });
    await check('USD/EUR are refused while disabled, unknown currencies always, and nothing is created', async () => {
      const count = async () => Number((await pool.query(`SELECT count(*) FROM donations`)).rows[0].count);
      const before = await count();
      await assert.rejects(donations.createDonation({ campaignId, donor, amount: 50, currency: 'USD' }), e => e.code === 'CURRENCY_NOT_ENABLED');
      await assert.rejects(donations.createDonation({ campaignId, donor, amount: 50, currency: 'GBP' }), e => e.code === 'UNSUPPORTED_CURRENCY');
      enableFx();
      await assert.rejects(donations.createDonation({ campaignId, donor, amount: 50, currency: 'USD', recurring: true }), e => e.code === 'CURRENCY_NOT_ENABLED');
      await assert.rejects(donations.createDonation({ campaignId, donor, amount: 100, currency: 'USD', rewards: [{ id: 'r1' }] }), e => e.code === 'ITEMS_REQUIRE_ILS');
      assert.equal(await count(), before);
    });
    let usdId, eurId;
    await check('USD and EUR checkout send the verified CardCom coin ids (2 and 978) with the original amount', async () => {
      usdId = (await donations.createDonation({ campaignId, donor, amount: '100', currency: 'usd' })).donationId;
      assert.equal(created.at(-1).ISOCoinId, 2); assert.equal(created.at(-1).Amount, 100);
      eurId = (await donations.createDonation({ campaignId, donor, amount: 36, currency: 'EUR' })).donationId;
      assert.equal(created.at(-1).ISOCoinId, 978);
      const d = await row(usdId);
      assert.equal(d.currency, 'USD'); assert.equal(d.fx_status, 'pending'); assert.equal(d.amount_ils, null);
    });

    // ── Confirmation ────────────────────────────────────────────────────────
    await check('ILS confirmation: paid, progress += amount, provider amount/coin recorded, receipt in ILS', async () => {
      const before = await campaign(campaignId);
      assert.equal((await pay(ilsId)).outcome, 'paid');
      const d = await row(ilsId);
      assert.equal(d.status, 'paid'); assert.equal(d.provider_amount, '180.00'); assert.equal(d.provider_coin_id, 1);
      assert.equal(Number((await campaign(campaignId)).current_amount) - Number(before.current_amount), 180);
      assert.equal((await pool.query(`SELECT currency FROM receipts WHERE donation_id=$1`, [ilsId])).rows[0].currency, 'ILS');
    });
    await check('USD confirmation: rate snapshot for the payment date, ILS equivalent computed in numeric, progress in ILS', async () => {
      const before = await campaign(campaignId);
      assert.equal((await pay(usdId)).outcome, 'paid');
      const d = await row(usdId);
      const [rateDate, rate] = expectedRate('RER_USD_ILS', israelToday());
      assert.equal(d.fx_status, 'resolved'); assert.equal(d.fx_rate_source, 'boi_representative');
      assert.equal(Number(d.fx_rate), Number(rate)); assert.equal(fxService.israelDate(d.fx_rate_date) <= rateDate, true);
      assert.equal(d.amount_ils, money.ilsEquivalent('100', rate));
      assert.equal(d.amount, '100.00'); assert.equal(d.provider_coin_id, 2);
      const after = await campaign(campaignId);
      assert.equal(money.toMinorUnits(after.current_amount) - money.toMinorUnits(before.current_amount), money.toMinorUnits(d.amount_ils), 'USD is never added as shekels');
      assert.equal(after.supporters_count, before.supporters_count + 1);
      assert.equal((await pool.query(`SELECT currency FROM receipts WHERE donation_id=$1`, [usdId])).rows[0].currency, 'USD');
    });
    await check('webhook redelivery is idempotent: no second paid transition, no double progress', async () => {
      const before = await campaign(campaignId);
      assert.equal((await pay(usdId)).outcome, 'already_paid');
      assert.deepEqual(await campaign(campaignId), before);
    });
    await check('the stored snapshot never changes, even if the provider later reports another rate', async () => {
      const d = await row(usdId);
      boi.rows.RER_USD_ILS = boi.rows.RER_USD_ILS.map(([day, v]) => [day, (Number(v) + 0.5).toFixed(4)]);
      await assert.rejects(pool.query(`UPDATE donations SET fx_rate = 9 WHERE id=$1`, [usdId]), /frozen once resolved/);
      await assert.rejects(pool.query(`UPDATE donations SET amount_ils = 1 WHERE id=$1`, [usdId]), /frozen/);
      assert.equal((await row(usdId)).amount_ils, d.amount_ils);
      boi.rows.RER_USD_ILS = boi.rows.RER_USD_ILS.map(([day, v]) => [day, (Number(v) - 0.5).toFixed(4)]);
    });
    await check('currency mismatch at CardCom (EUR donation confirmed as ILS) is held, never marked paid', async () => {
      lp.get(await lowProfileOf(eurId)).CoinId = 1;
      const res = await pay(eurId);
      assert.equal(res.outcome, 'verification_hold'); assert.ok(res.reasons.includes('coin_id_mismatch'));
      assert.equal((await row(eurId)).status, 'pending');
      const finding = (await pool.query(`SELECT details FROM reconciliation_findings WHERE subject_id=$1 AND finding_type='gate_v1_mismatch'`, [eurId])).rows[0];
      assert.equal(finding.details.dbCurrency, 'EUR');
    });
    await check('amount mismatch in the donation currency is held too', async () => {
      const id = (await donations.createDonation({ campaignId, donor, amount: 20, currency: 'EUR' })).donationId;
      lp.get(await lowProfileOf(id)).Amount = 20.5;
      const res = await pay(id);
      assert.equal(res.outcome, 'verification_hold'); assert.ok(res.reasons.includes('amount_mismatch'));
    });
    await check('rate source down at payment time: still paid (money was taken), fx pending, not in progress; backfill completes it exactly once', async () => {
      const otherCampaign = await newCampaign();
      const id = (await donations.createDonation({ campaignId: otherCampaign, donor, amount: 50, currency: 'EUR' })).donationId;
      const resolverForToday = await pool.query(`DELETE FROM exchange_rate_resolutions WHERE currency='EUR' AND for_date=$1 RETURNING 1`, [israelToday()]).catch(() => null);
      boi.down = true;
      // A fresh module instance (no in-memory cache from earlier checks).
      delete require.cache[require.resolve(root + '/src/modules/currency/exchange-rate.service')];
      assert.equal((await pay(id)).outcome, 'paid');
      let d = await row(id);
      assert.equal(d.status, 'paid'); assert.equal(d.fx_status, 'pending'); assert.equal(d.amount_ils, null);
      assert.equal((await campaign(otherCampaign)).current_amount, '0.00');
      assert.equal((await campaign(otherCampaign)).supporters_count, 1);
      assert.ok((await pool.query(`SELECT 1 FROM reconciliation_findings WHERE subject_id=$1 AND finding_type='fx_rate_pending'`, [id])).rows[0]);
      assert.deepEqual(await donations.resolvePendingFx(), { checked: 1, resolved: 0, stillPending: 1 }, 'still down: nothing invented');
      boi.down = false;
      const result = await donations.resolvePendingFx();
      assert.equal(result.resolved, 1);
      d = await row(id);
      assert.equal(d.fx_status, 'resolved');
      assert.equal((await campaign(otherCampaign)).current_amount, d.amount_ils);
      assert.deepEqual(await donations.resolvePendingFx(), { checked: 0, resolved: 0, stillPending: 0 });
      assert.equal((await campaign(otherCampaign)).current_amount, d.amount_ils, 'no double count');
      void resolverForToday;
    });

    // ── Recurring ───────────────────────────────────────────────────────────
    await check('ILS recurring signup still sends FinalDebitCoinId=1; each recurring charge gets its own snapshot in the authorized currency', async () => {
      const id = (await donations.createDonation({ campaignId, donor, amount: 50, recurring: true, installments: 6 })).donationId;
      await pay(id);
      assert.equal(recurringPosts.at(-1).get('RecurringPayments.FinalDebitCoinId'), '1');
      enableFx(true);
      const usdRecurring = (await donations.createDonation({ campaignId, donor, amount: 25, currency: 'USD', recurring: true, installments: 6 })).donationId;
      await pay(usdRecurring);
      assert.equal(recurringPosts.at(-1).get('RecurringPayments.FinalDebitCoinId'), '2');
      const instruction = (await pool.query(`SELECT ri.* FROM recurring_instructions ri JOIN donations d ON d.recurring_instruction_id = ri.id WHERE d.id=$1`, [usdRecurring])).rows[0];
      assert.equal(instruction.currency, 'USD');
      await assert.rejects(pool.query(`UPDATE recurring_instructions SET currency='ILS' WHERE id=$1`, [instruction.id]), /currency cannot change/);
      const before = await campaign(campaignId);
      const chargeId = await donations.finalizeSuccessfulRecurringCharge(instruction, { amount: 25, providerReference: 'deal-1', rowId: '1' });
      const charge = await row(chargeId);
      assert.equal(charge.currency, 'USD'); assert.equal(charge.fx_status, 'resolved'); assert.equal(charge.amount, '25.00');
      assert.equal(money.toMinorUnits((await campaign(campaignId)).current_amount) - money.toMinorUnits(before.current_amount), money.toMinorUnits(charge.amount_ils));
      disableFx();
    });
    await check('recurring reconciliation holds a charge whose currency differs from the authorized one', async () => {
      const job = require(root + '/src/jobs/recurring-payment-reconciliation.job');
      const instruction = (await pool.query(`SELECT * FROM recurring_instructions WHERE currency='USD' LIMIT 1`)).rows[0];
      assert.equal(instruction.status, 'active'); assert.ok(instruction.cardcom_recurring_id);
      let finalized = 0;
      const deps = {
        getHistory: async () => ({ ResponseCode: 0, RecurringPaymentHistory: [{ RecurringId: instruction.cardcom_recurring_id, Status: 'SUCCESSFUL', SumToBill: 30, FinalDebitCoinID: 1, TranzactionId: 991, RowID: 9001, BillingDate: new Date().toISOString() }] }),
        resolveCredentials: async () => ({ terminalNumber: '1000', apiName: 'api', apiPassword: 'secret' }),
        finalizeCharge: async () => { finalized++; },
      };
      const run = job.reconcileAllActiveInstructions || job.handler;
      await run(pool, deps);
      assert.equal(finalized, 0);
      assert.ok((await pool.query(`SELECT 1 FROM reconciliation_findings WHERE subject_id=$1 AND finding_type='recurring_charge_currency_mismatch'`, [instruction.id])).rows[0]);
    });

    // ── Progress, attribution, reports ──────────────────────────────────────
    await check('campaign aggregate stays consistent (aggregate-consistency job sees no mismatch)', async () => {
      const job = require(root + '/src/jobs/aggregate-consistency.job');
      const res = await job.handler(pool);
      assert.equal(res.mismatches, 0);
    });
    await check('ambassador totals count USD donations by their ILS equivalent', async () => {
      const { rows: [amb] } = await pool.query(`INSERT INTO campaign_ambassadors (campaign_id, full_name, slug, status) VALUES ($1, 'שגריר', 'amb-${Date.now()}', 'active') RETURNING id`, [campaignId]);
      enableFx();
      const id = (await donations.createDonation({ campaignId, donor, amount: 10, currency: 'USD', ambassadorId: amb.id })).donationId;
      await pay(id);
      disableFx();
      const d = await row(id);
      assert.equal(d.ambassador_id, amb.id);
      const list = await require(root + '/src/modules/ambassadors/ambassadors.service').getEntityAmbassadorsList(entity.id);
      const mine = (list.ambassadors || list.rows || list).find(a => a.id === amb.id);
      assert.equal(Number(mine.raised_total), Number(d.amount_ils));
    });
    await check('donations admin list shows original amount + currency; KPIs are in ILS equivalent', async () => {
      const res = await donations.getEntityDonations(entity.id, { campaignId });
      const usd = res.donations.find(x => x.id === usdId);
      assert.equal(usd.currency, 'USD'); assert.equal(usd.amount, 100); assert.equal(typeof usd.amount_ils, 'number');
      const { rows: [sum] } = await pool.query(`SELECT sum(amount_ils)::float s FROM donations WHERE campaign_id=$1 AND status='paid'`, [campaignId]);
      assert.equal(res.kpi.totalRaised, sum.s);
      const raw = (await pool.query(`SELECT sum(amount)::float s FROM donations WHERE campaign_id=$1 AND status='paid'`, [campaignId])).rows[0].s;
      assert.notEqual(res.kpi.totalRaised, raw, 'mixed-currency raw sum is never reported');
    });
    await check('success redirect carries the currency for USD/EUR only', async () => {
      const ils = await donations.handleReturn({ donationId: ilsId, status: 'success' });
      assert.doesNotMatch(ils.redirectUrl, /currency=/);
      const usd = await donations.handleReturn({ donationId: usdId, status: 'success' });
      assert.match(usd.redirectUrl, /&amount=100\.00&currency=USD$/);
      assert.equal((await donations.getDonationPublic(usdId)).currency, 'USD');
    });

    // ── FIN-11 ──────────────────────────────────────────────────────────────
    await check('FIN-11 billing, collection and MASAV code is untouched by this change', async () => {
      const changed = execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'src/modules/billing-engine', 'src/modules/collection-engine', 'src/modules/billing', 'src/jobs/billing-monthly-cycle.job.js', 'src/jobs/fin11-card-collection.job.js', 'src/jobs/fin11-masav-prepare.job.js', 'src/modules/platform/collection-ops'], { encoding: 'utf8' })
        .split('\n').filter(Boolean).filter(l => !/billing\/(billing\.service|billing\.repository|cardcom\.routes)\.js$/.test(l));
      assert.deepEqual(changed, []);
    });
  } finally {
    await pool?.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${DATA_DB} WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
    require(root + '/src/db/db').end?.().catch?.(() => {});
  }
  console.log(`\n${passed} passed`);
})().catch(err => { console.error('FAIL', err); process.exitCode = 1; });
