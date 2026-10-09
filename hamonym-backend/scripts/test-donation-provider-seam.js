// Phase B1 (2026-10-09) — proves the donation CardCom provider seam is a
// PURE extraction: after moving LowProfile/Create out of
// donations.service.js into lowprofile.client.js and routing every donation
// CardCom call through src/modules/payment/donation-provider.js, the bytes
// on the wire, the credential rails, the response shapes and the error
// shapes are all unchanged.
//
// Transport mocking: `axios.defaults.adapter` is replaced for the whole run.
// That IS axios's own HTTP layer — the single lowest point in the stack
// before a socket is opened — so no real CardCom request is possible, and it
// hands us the request EXACTLY as it would have been serialized (config.url,
// config.method, the already-stringified config.data, timeout, headers).
// This is strictly stronger than monkey-patching axios.post (the convention
// in scripts/test-donation-server-validation.js), and it also covers
// cardcom.client.js's GetRecurringPaymentHistory, which is an `axios({...})`
// call and cannot be intercepted by patching .post at all.
//
// Fixtures are real DB rows, all ZZZ_B1-prefixed, and every donation created
// here stays 'pending' — nothing is ever marked 'paid', so nothing hits
// migration 055's immutability trigger and everything is deleted at the end.
//
// Run: node scripts/test-donation-provider-seam.js

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const db = require('../src/db/db');

let failures = 0;
let passed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log('      ', err.stack || err.message);
  }
}

/* ── transport capture ──────────────────────────────────────────────────── */

const realAdapter = axios.defaults.adapter;
let captured = [];
let nextResponses = [];

function headerValue(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name];
}

function installTransportCapture() {
  axios.defaults.adapter = async (config) => {
    captured.push({
      url: config.url,
      method: config.method,
      data: config.data,
      timeout: config.timeout,
      contentType: headerValue(config.headers, 'Content-Type'),
    });
    const next = nextResponses.length ? nextResponses.shift() : { data: {} };
    if (next.throwHttp) {
      const err = new Error('Request failed with status code 500');
      err.response = { status: 500, data: next.throwHttp };
      throw err;
    }
    return { data: next.data, status: 200, statusText: 'OK', headers: {}, config };
  };
}

function resetCapture(responses = []) {
  captured = [];
  nextResponses = [...responses];
}

function lpOk(lowProfileId) {
  return { data: { ResponseCode: 0, LowProfileId: lowProfileId, Url: `https://secure.cardcom.solutions/External/LowProfile.aspx?LowProfileId=${lowProfileId}` } };
}

/* ── constants the pre-refactor code used, restated independently ───────── */

const EXPECTED_CREATE_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';
const EXPECTED_GETLP_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult';
const EXPECTED_RECURRING_URL = 'https://secure.cardcom.solutions/interface/RecurringPayment.aspx';
const EXPECTED_HISTORY_URL = 'https://secure.cardcom.solutions/api/v11/RecuringPayments/GetRecurringPaymentHistory';
const EXPECTED_TIMEOUT = 15000;

// The exact key order donations.service.js::createDonation built the payload
// in before the extraction — key order is part of the serialized JSON body,
// so this is the byte-level assertion.
const EXPECTED_LP_KEYS_ONE_TIME = [
  'TerminalNumber', 'ApiName', 'ApiPassword', 'Amount', 'Language',
  'SuccessRedirectUrl', 'FailedRedirectUrl', 'WebHookUrl', 'ReturnValue', 'Document',
];
const EXPECTED_LP_KEYS_RECURRING = [
  'TerminalNumber', 'ApiName', 'ApiPassword', 'Amount', 'Language', 'Operation',
  'SuccessRedirectUrl', 'FailedRedirectUrl', 'WebHookUrl', 'ReturnValue', 'Document',
];

const ENTITY_CREDS = {
  terminalNumber: 'zzz-b1-entity-terminal',
  apiName: 'zzz-b1-entity-api-name',
  apiPassword: 'zzz-b1-entity-api-password',
};
const DONATION_FALLBACK_CREDS = {
  terminalNumber: 'zzz-b1-donations-terminal',
  apiName: 'zzz-b1-donations-api-name',
  apiPassword: 'zzz-b1-donations-api-password',
};
// Sentinel platform-BILLING credentials. These must never appear in any
// captured donation request, under any configuration.
const PLATFORM_BILLING_SENTINELS = {
  HAMONYM_CARDCOM_TERMINAL: 'zzz-b1-PLATFORM-BILLING-TERMINAL-MUST-NOT-LEAK',
  HAMONYM_CARDCOM_API_NAME: 'zzz-b1-PLATFORM-BILLING-API-NAME-MUST-NOT-LEAK',
  HAMONYM_CARDCOM_API_PASSWORD: 'zzz-b1-PLATFORM-BILLING-API-PASSWORD-MUST-NOT-LEAK',
};

function setDonationFallbackEnv() {
  process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = DONATION_FALLBACK_CREDS.terminalNumber;
  process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = DONATION_FALLBACK_CREDS.apiName;
  process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD = DONATION_FALLBACK_CREDS.apiPassword;
}

function unsetDonationFallbackEnv() {
  delete process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL;
  delete process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME;
  delete process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD;
}

function sourceWithoutComments(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/* ── fixtures ───────────────────────────────────────────────────────────── */

const fixture = {};

async function createFixtures() {
  const userRes = await db.query('SELECT id FROM users LIMIT 1');
  if (!userRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK');
  const userId = userRes.rows[0].id;

  const unverified = await db.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_B1 Unverified Entity', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  fixture.entityUnverifiedId = unverified.rows[0].id;

  const verified = await db.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id,
            cardcom_terminal_number, cardcom_api_username, cardcom_api_password_encrypted, cardcom_connection_status)
     VALUES ('ZZZ_B1 Verified Entity', 'association', 'active', $1, $2, $3, $4, 'success') RETURNING id`,
    [userId, ENTITY_CREDS.terminalNumber, ENTITY_CREDS.apiName, ENTITY_CREDS.apiPassword]
  );
  fixture.entityVerifiedId = verified.rows[0].id;

  const stamp = Date.now();
  for (const [key, entityId, title] of [
    ['campaignUnverifiedId', fixture.entityUnverifiedId, 'ZZZ_B1 Unverified Campaign'],
    ['campaignVerifiedId', fixture.entityVerifiedId, 'ZZZ_B1 Verified Campaign'],
  ]) {
    const res = await db.query(
      `INSERT INTO campaigns (entity_id, slug, title, status, rewards)
       VALUES ($1, $2, $3, 'active', '[]'::jsonb) RETURNING id`,
      [entityId, `zzz-b1-${key}-${stamp}`, title]
    );
    fixture[key] = res.rows[0].id;
  }
}

const createdDonationIds = [];
const createdInstructionIds = [];

async function cleanupFixtures() {
  for (const id of createdDonationIds) {
    await db.query(`DELETE FROM donations WHERE id = $1 AND status <> 'paid'`, [id]).catch(() => {});
  }
  for (const id of createdInstructionIds) {
    await db.query(`DELETE FROM recurring_instructions WHERE id = $1`, [id]).catch(() => {});
  }
  await db.query(`DELETE FROM donations WHERE campaign_id = ANY($1::uuid[]) AND status <> 'paid'`,
    [[fixture.campaignUnverifiedId, fixture.campaignVerifiedId].filter(Boolean)]).catch(() => {});
  await db.query(`DELETE FROM recurring_instructions WHERE campaign_id = ANY($1::uuid[])`,
    [[fixture.campaignUnverifiedId, fixture.campaignVerifiedId].filter(Boolean)]).catch(() => {});
  for (const id of [fixture.campaignUnverifiedId, fixture.campaignVerifiedId]) {
    if (id) await db.query('DELETE FROM campaigns WHERE id = $1', [id]).catch(() => {});
  }
  for (const id of [fixture.entityUnverifiedId, fixture.entityVerifiedId]) {
    if (id) await db.query('DELETE FROM entities WHERE id = $1', [id]).catch(() => {});
  }
}

function baseDonor() {
  return { name: 'ZZZ_B1 Donor', email: 'zzz-b1-donor@example.test', phone: '0500000000' };
}

/* ── the run ────────────────────────────────────────────────────────────── */

async function run() {
  installTransportCapture();
  setDonationFallbackEnv();
  delete process.env.PAYMENT_PROVIDER; // never the mock rail in this test
  Object.assign(process.env, PLATFORM_BILLING_SENTINELS);

  await createFixtures();

  const donationsService = require('../src/modules/donations/donations.service');
  const recurringService = require('../src/modules/donations/recurring.service');
  const paymentHandler = require('../src/modules/payment/handlers/payment.handler');
  const { getDonationProvider } = require('../src/modules/payment/donation-provider');
  const { evaluateGateV1 } = require('../src/modules/payment/verification-gate');
  const { reconcileAllActiveInstructions } = require('../src/jobs/recurring-payment-reconciliation.job');

  async function createPendingDonation(campaignId, overrides = {}) {
    const result = await donationsService.createDonation({
      campaignId,
      donor: baseDonor(),
      amount: 180,
      rewards: [],
      participants: [],
      ...overrides,
    });
    createdDonationIds.push(result.donationId);
    return result;
  }

  /* ── 1. LowProfile/Create transport is byte-for-byte unchanged ───────── */

  await check('1a. LowProfile/Create still goes POST to the exact v11 Create URL, with Content-Type application/json and timeout 15000', async () => {
    resetCapture([lpOk('zzz-b1-lp-1a')]);
    await createPendingDonation(fixture.campaignUnverifiedId);
    assert.strictEqual(captured.length, 1, 'exactly one outbound request');
    assert.strictEqual(captured[0].url, EXPECTED_CREATE_URL);
    assert.strictEqual(captured[0].method, 'post');
    assert.strictEqual(captured[0].timeout, EXPECTED_TIMEOUT);
    assert.strictEqual(captured[0].contentType, 'application/json');
  });

  await check('1b. one-time donation body: exact key set AND key order (i.e. the serialized JSON bytes) match the pre-extraction payload', async () => {
    resetCapture([lpOk('zzz-b1-lp-1b')]);
    const { donationId } = await createPendingDonation(fixture.campaignUnverifiedId, { amount: 180 });
    const body = JSON.parse(captured[0].data);
    assert.deepStrictEqual(Object.keys(body), EXPECTED_LP_KEYS_ONE_TIME);

    const returnBase = process.env.BACKEND_URL || 'http://localhost:3000';
    assert.deepStrictEqual(body, {
      TerminalNumber: DONATION_FALLBACK_CREDS.terminalNumber,
      ApiName: DONATION_FALLBACK_CREDS.apiName,
      ApiPassword: DONATION_FALLBACK_CREDS.apiPassword,
      Amount: 180,
      Language: 'he',
      SuccessRedirectUrl: `${returnBase}/api/donations/return?id=${donationId}&status=success`,
      FailedRedirectUrl: `${returnBase}/api/donations/return?id=${donationId}&status=failed`,
      WebHookUrl: `${returnBase}/api/payment/webhook?secret=${process.env.CARDCOM_WEBHOOK_SECRET}`,
      ReturnValue: String(donationId),
      Document: {
        To: 'ZZZ_B1 Donor',
        Email: 'zzz-b1-donor@example.test',
        Phone: '0500000000',
        Mobile: '0500000000',
        Products: [{ Description: 'תרומה — ZZZ_B1 Unverified Campaign', UnitCost: 180 }],
      },
    });
  });

  await check('1c. recurring donation body adds Operation=ChargeAndCreateToken in its original position, and nothing else changes', async () => {
    resetCapture([lpOk('zzz-b1-lp-1c')]);
    const { donationId } = await createPendingDonation(fixture.campaignUnverifiedId, { recurring: true, installments: 12 });
    const body = JSON.parse(captured[0].data);
    assert.deepStrictEqual(Object.keys(body), EXPECTED_LP_KEYS_RECURRING);
    assert.strictEqual(body.Operation, 'ChargeAndCreateToken');
    const instr = await db.query('SELECT recurring_instruction_id FROM donations WHERE id = $1', [donationId]);
    assert.ok(instr.rows[0].recurring_instruction_id, 'a recurring instruction must be linked');
    createdInstructionIds.push(instr.rows[0].recurring_instruction_id);
  });

  await check('1d. a transport failure still surfaces CardCom Description via err.response.data.Description, and the donation is marked failed', async () => {
    resetCapture([{ throwHttp: { Description: 'ZZZ_B1 simulated provider rejection' } }]);
    let thrown = null;
    try {
      await createPendingDonation(fixture.campaignUnverifiedId);
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'createDonation must throw');
    assert.strictEqual(thrown.message, 'ZZZ_B1 simulated provider rejection',
      'the error business logic sees must still be built from err.response.data.Description');
    const failed = await db.query(
      `SELECT status FROM donations WHERE campaign_id = $1 AND status = 'failed'`,
      [fixture.campaignUnverifiedId]
    );
    assert.ok(failed.rows.length >= 1, 'the donation row must have been marked failed');
  });

  await check('1e. a non-zero CardCom ResponseCode still throws the Description-based error, unchanged', async () => {
    resetCapture([{ data: { ResponseCode: 701, Description: 'ZZZ_B1 bad terminal' } }]);
    await assert.rejects(() => createPendingDonation(fixture.campaignUnverifiedId), /ZZZ_B1 bad terminal/);
  });

  /* ── 2. credential rails ────────────────────────────────────────────────── */

  await check('2a. a verified entity still sends its OWN entity credentials', async () => {
    resetCapture([lpOk('zzz-b1-lp-2a')]);
    await createPendingDonation(fixture.campaignVerifiedId);
    const body = JSON.parse(captured[0].data);
    assert.strictEqual(body.TerminalNumber, ENTITY_CREDS.terminalNumber);
    assert.strictEqual(body.ApiName, ENTITY_CREDS.apiName);
    assert.strictEqual(body.ApiPassword, ENTITY_CREDS.apiPassword);
  });

  await check('2b. an unverified entity still falls back to HAMONYM_DONATIONS_CARDCOM_* (never HAMONYM_CARDCOM_*)', async () => {
    resetCapture([lpOk('zzz-b1-lp-2b')]);
    await createPendingDonation(fixture.campaignUnverifiedId);
    const body = JSON.parse(captured[0].data);
    assert.strictEqual(body.TerminalNumber, DONATION_FALLBACK_CREDS.terminalNumber);
    assert.strictEqual(body.ApiName, DONATION_FALLBACK_CREDS.apiName);
    assert.strictEqual(body.ApiPassword, DONATION_FALLBACK_CREDS.apiPassword);
  });

  // A pending donation on the unverified entity, created while the donation
  // fallback IS configured, so the next check can ask about it once it isn't.
  resetCapture([lpOk('zzz-b1-lp-anti-fallback')]);
  const antiFallbackDonation = await createPendingDonation(fixture.campaignUnverifiedId);

  await check('2c. CRITICAL — with ONLY platform-billing env set, resolveCardcomCredentials throws DONATION_CARDCOM_FALLBACK_NOT_CONFIGURED instead of borrowing it', async () => {
    unsetDonationFallbackEnv();
    try {
      await assert.rejects(
        () => donationsService.resolveCardcomCredentials(antiFallbackDonation.donationId),
        (err) => {
          assert.strictEqual(err.code, 'DONATION_CARDCOM_FALLBACK_NOT_CONFIGURED');
          assert.ok(/refusing to fall back to the Billing terminal credentials/.test(err.message));
          return true;
        }
      );
      await assert.rejects(
        () => donationsService.resolveCardcomCredentialsForEntity(fixture.entityUnverifiedId),
        (err) => err.code === 'DONATION_CARDCOM_FALLBACK_NOT_CONFIGURED'
      );
    } finally {
      setDonationFallbackEnv();
    }
  });

  await check('2d. CRITICAL — with ONLY platform-billing env set, createDonation refuses with PAYMENT_NOT_CONFIGURED and makes NO outbound request at all', async () => {
    unsetDonationFallbackEnv();
    resetCapture([]);
    try {
      await assert.rejects(
        () => donationsService.createDonation({
          campaignId: fixture.campaignUnverifiedId,
          donor: baseDonor(), amount: 50, rewards: [], participants: [],
        }),
        (err) => err.code === 'PAYMENT_NOT_CONFIGURED'
      );
      assert.strictEqual(captured.length, 0, 'nothing may go out on the wire');
    } finally {
      setDonationFallbackEnv();
    }
  });

  await check('2e. CRITICAL — no platform-billing sentinel value appears anywhere in ANY request captured in this whole run', async () => {
    const sentinels = Object.values(PLATFORM_BILLING_SENTINELS);
    const allBodies = JSON.stringify(captured);
    for (const s of sentinels) {
      assert.ok(!allBodies.includes(s), `platform-billing credential leaked into a donation request: ${s}`);
    }
  });

  await check('2f. CRITICAL — structurally, no donation client/provider file reads process.env or names HAMONYM_CARDCOM_* in code', async () => {
    for (const rel of [
      'src/modules/payment/donation-provider.js',
      'src/modules/payment/cardcom/donation.provider.js',
      'src/modules/payment/cardcom/lowprofile.client.js',
      'src/modules/payment/cardcom/cardcom.client.js',
      'src/modules/payment/cardcom/recurring.client.js',
    ]) {
      const src = sourceWithoutComments(rel);
      assert.ok(!src.includes('process.env'), `${rel} must not read process.env — credential resolution stays in donations.service.js`);
      assert.ok(!src.includes('HAMONYM_CARDCOM'), `${rel} must never name the platform-billing credential rail`);
    }
  });

  await check('2g. the platform-billing rail does NOT resolve through the donation provider', async () => {
    for (const rel of [
      'src/modules/billing/billing.service.js',
      'src/modules/billing/cardcom.service.js',
      'src/modules/collection-engine/adapters/cardcom-token-charge.adapter.js',
    ]) {
      const src = sourceWithoutComments(rel);
      assert.ok(!src.includes('donation-provider'), `${rel} must not reach into the donation provider`);
      assert.ok(!src.includes('donation.provider'), `${rel} must not reach into the donation provider`);
    }
  });

  /* ── 3. GetLpResult ─────────────────────────────────────────────────────── */

  await check('3a. provider.getLpResult sends the same four fields to the same URL with timeout 15000 and returns response.data untouched', async () => {
    const sentinel = { ResponseCode: 0, LowProfileId: 'zzz-b1-lp-3a', ReturnValue: 'zzz-b1-rv', TranzactionId: 123456, TranzactionInfo: { ResponseCode: 0, Amount: 180, CoinId: 1 } };
    resetCapture([{ data: sentinel }]);
    const result = await getDonationProvider().getLpResult({
      terminalNumber: 't', apiName: 'n', apiPassword: 'p', lowProfileId: 'zzz-b1-lp-3a',
    });
    assert.strictEqual(captured[0].url, EXPECTED_GETLP_URL);
    assert.strictEqual(captured[0].method, 'post');
    assert.strictEqual(captured[0].timeout, EXPECTED_TIMEOUT);
    assert.deepStrictEqual(JSON.parse(captured[0].data), {
      TerminalNumber: 't', ApiName: 'n', ApiPassword: 'p', LowProfileId: 'zzz-b1-lp-3a',
    });
    assert.deepStrictEqual(result, sentinel, 'the facade must pass GetLpResult data through unchanged');
  });

  await check('3b. payment.handler consumes the provider result in the shape it already expected (non-zero ResponseCode -> not_paid_at_cardcom, nothing marked paid)', async () => {
    resetCapture([lpOk('zzz-b1-lp-3b')]);
    const donation = await createPendingDonation(fixture.campaignUnverifiedId);
    const lpRow = await db.query('SELECT low_profile_id, status FROM donations WHERE id = $1', [donation.donationId]);
    assert.strictEqual(lpRow.rows[0].low_profile_id, 'zzz-b1-lp-3b', 'LowProfileId must still be persisted from the provider response');

    resetCapture([{ data: { ResponseCode: 2, Description: 'ZZZ_B1 not completed' } }]);
    const outcome = await paymentHandler.handle({ ReturnValue: donation.donationId, LowProfileId: 'zzz-b1-lp-3b' });
    assert.strictEqual(captured[0].url, EXPECTED_GETLP_URL, 'the handler must still reach GetLpResult through the seam');
    assert.deepStrictEqual(outcome, { outcome: 'not_paid_at_cardcom', donationId: donation.donationId, responseCode: 2 });
    const after = await db.query('SELECT status FROM donations WHERE id = $1', [donation.donationId]);
    assert.strictEqual(after.rows[0].status, 'pending', 'nothing may be marked paid');
  });

  await check('3c. Gate v1 is unchanged: a matching GetLpResult passes, and each mismatch still yields its original reason code', async () => {
    const donation = { amount: 180, low_profile_id: 'lp-x' };
    const good = { ReturnValue: 'd-1', LowProfileId: 'lp-x', TranzactionInfo: { ResponseCode: 0, Amount: 180, CoinId: 1 } };
    assert.deepStrictEqual(evaluateGateV1({ result: good, donation, donationId: 'd-1' }).reasons, []);
    assert.strictEqual(evaluateGateV1({ result: good, donation, donationId: 'd-1' }).pass, true);

    assert.deepStrictEqual(
      evaluateGateV1({ result: { ...good, TranzactionInfo: { ResponseCode: 0, Amount: 1, CoinId: 1 } }, donation, donationId: 'd-1' }).reasons,
      ['amount_mismatch']
    );
    assert.deepStrictEqual(
      evaluateGateV1({ result: { ...good, TranzactionInfo: { ResponseCode: 0, Amount: 180, CoinId: 2 } }, donation, donationId: 'd-1' }).reasons,
      ['coin_id_mismatch']
    );
    assert.deepStrictEqual(
      evaluateGateV1({ result: { ...good, LowProfileId: 'other' }, donation, donationId: 'd-1' }).reasons,
      ['low_profile_id_mismatch']
    );
    assert.deepStrictEqual(
      evaluateGateV1({ result: { ...good, ReturnValue: 'other' }, donation, donationId: 'd-1' }).reasons,
      ['return_value_mismatch']
    );
    assert.deepStrictEqual(
      evaluateGateV1({ result: { ReturnValue: 'd-1', LowProfileId: 'lp-x' }, donation, donationId: 'd-1' }).reasons,
      ['tranzaction_info_missing']
    );
  });

  /* ── 4/5. recurring Create + Update ─────────────────────────────────────── */

  await check('4a. recurring Create still POSTs form-urlencoded to RecurringPayment.aspx with timeout 15000 and the original field names', async () => {
    resetCapture([{ data: 'ResponseCode=0&Description=Success&AccountId=4337&Recurring0.RecurringId=99887' }]);
    const result = await getDonationProvider().createRecurring({
      terminalNumber: 'T1', userName: 'U1', apiPassword: 'P1', chargeInTerminal: 'T1',
      lowProfileDealGuid: 'guid-1', donorName: 'ZZZ_B1 Donor', amount: 180,
      invoiceDescription: 'תרומה חודשית', internalDescription: 'Hamonym recurring — zzz',
      nextDateToBill: '09/11/2026', totalNumOfBills: 11, timeIntervalId: 1, returnValue: 'instr-1',
    });
    assert.strictEqual(captured[0].url, EXPECTED_RECURRING_URL);
    assert.strictEqual(captured[0].method, 'post');
    assert.strictEqual(captured[0].timeout, EXPECTED_TIMEOUT);
    assert.strictEqual(captured[0].contentType, 'application/x-www-form-urlencoded');
    const p = new URLSearchParams(captured[0].data);
    assert.strictEqual(p.get('Operation'), 'NewAndUpdate');
    assert.strictEqual(p.get('codepage'), '65001');
    assert.strictEqual(p.get('LowProfileDealGuid'), 'guid-1');
    assert.strictEqual(p.get('RecurringPayments.TotalNumOfBills'), '11');
    assert.strictEqual(p.get('RecurringPayments.FinalDebitCoinId'), '1');
    assert.strictEqual(p.get('RecurringPayments.FlexItem.Price'), '180');
    // Name-to-Value responses are parsed into STRINGS — recurring.service.js
    // compares `result.ResponseCode === '0'`, so a numeric 0 here would
    // silently turn every successful signup into creation_failed.
    assert.strictEqual(result.ResponseCode, '0');
    assert.strictEqual(typeof result.ResponseCode, 'string');
    assert.strictEqual(result['Recurring0.RecurringId'], '99887');
    assert.strictEqual(result.AccountId, '4337');
  });

  await check('4b. completeSignup end-to-end: TotalNumOfBills = totalInstallments - 1, and ResponseCode "0" still flips the instruction to active', async () => {
    resetCapture([lpOk('zzz-b1-lp-4b')]);
    const donation = await createPendingDonation(fixture.campaignUnverifiedId, { recurring: true, installments: 12 });
    const instrRes = await db.query('SELECT recurring_instruction_id FROM donations WHERE id = $1', [donation.donationId]);
    const instructionId = instrRes.rows[0].recurring_instruction_id;
    createdInstructionIds.push(instructionId);

    resetCapture([{ data: 'ResponseCode=0&Description=Success&AccountId=4337&Recurring0.RecurringId=99888' }]);
    await recurringService.completeSignup(donation.donationId);

    assert.strictEqual(captured.length, 1, 'exactly one recurring Create call');
    assert.strictEqual(captured[0].url, EXPECTED_RECURRING_URL);
    const p = new URLSearchParams(captured[0].data);
    assert.strictEqual(p.get('RecurringPayments.TotalNumOfBills'), '11', '12 promised payments minus the LowProfile charge');
    assert.strictEqual(p.get('LowProfileDealGuid'), 'zzz-b1-lp-4b');

    const after = await db.query(
      'SELECT status, cardcom_recurring_id, cardcom_account_id, total_installments FROM recurring_instructions WHERE id = $1',
      [instructionId]
    );
    assert.strictEqual(after.rows[0].status, 'active');
    assert.strictEqual(String(after.rows[0].cardcom_recurring_id), '99888');
    assert.strictEqual(String(after.rows[0].cardcom_account_id), '4337');
    assert.strictEqual(Number(after.rows[0].total_installments), 12);
  });

  await check('4c. completeSignup with a non-"0" ResponseCode still records creation_failed with the Description, unchanged', async () => {
    resetCapture([lpOk('zzz-b1-lp-4c')]);
    const donation = await createPendingDonation(fixture.campaignUnverifiedId, { recurring: true, installments: 6 });
    const instrRes = await db.query('SELECT recurring_instruction_id FROM donations WHERE id = $1', [donation.donationId]);
    const instructionId = instrRes.rows[0].recurring_instruction_id;
    createdInstructionIds.push(instructionId);

    resetCapture([{ data: 'ResponseCode=8500&Description=ZZZ_B1%20Low%20Profile%20Deal%20have%20no%20token' }]);
    await recurringService.completeSignup(donation.donationId);

    const after = await db.query('SELECT status, failure_reason FROM recurring_instructions WHERE id = $1', [instructionId]);
    assert.strictEqual(after.rows[0].status, 'creation_failed');
    assert.strictEqual(after.rows[0].failure_reason, 'ZZZ_B1 Low Profile Deal have no token');
  });

  await check('5a. recurring Update (pause/cancel shape): Operation=update + IsActive=false, and NO NextDateToBill is sent', async () => {
    resetCapture([{ data: 'ResponseCode=0&Description=Success' }]);
    const result = await getDonationProvider().updateRecurring({
      terminalNumber: 'T1', userName: 'U1', apiPassword: 'P1', recurringId: 99888, isActive: false,
    });
    assert.strictEqual(captured[0].url, EXPECTED_RECURRING_URL);
    assert.strictEqual(captured[0].contentType, 'application/x-www-form-urlencoded');
    assert.strictEqual(captured[0].timeout, EXPECTED_TIMEOUT);
    const p = new URLSearchParams(captured[0].data);
    assert.strictEqual(p.get('Operation'), 'update');
    assert.strictEqual(p.get('RecurringPayments.RecurringId'), '99888');
    assert.strictEqual(p.get('RecurringPayments.IsActive'), 'false');
    assert.strictEqual(p.has('RecurringPayments.NextDateToBill'), false, 'Pause must not touch NextDateToBill');
    assert.strictEqual(result.ResponseCode, '0');
  });

  await check('5b. recurring Update (resume shape): IsActive=true AND an explicit NextDateToBill are both sent', async () => {
    resetCapture([{ data: 'ResponseCode=0&Description=Success' }]);
    await getDonationProvider().updateRecurring({
      terminalNumber: 'T1', userName: 'U1', apiPassword: 'P1', recurringId: 99888,
      isActive: true, nextDateToBill: '09/11/2026',
    });
    const p = new URLSearchParams(captured[0].data);
    assert.strictEqual(p.get('RecurringPayments.IsActive'), 'true');
    assert.strictEqual(p.get('RecurringPayments.NextDateToBill'), '09/11/2026');
  });

  await check('5c. pauseRecurring / resumeRecurring / cancelRecurring still drive the instruction through the seam and still reject a non-"0" ResponseCode', async () => {
    const instrRes = await db.query(
      `INSERT INTO recurring_instructions (entity_id, campaign_id, donor_name, amount, time_interval_id, status, cardcom_recurring_id, next_date_to_bill, billing_anchor_day)
       VALUES ($1, $2, 'ZZZ_B1 Donor', 180, 1, 'active', '99889', NOW() + INTERVAL '10 days', 9) RETURNING id`,
      [fixture.entityUnverifiedId, fixture.campaignUnverifiedId]
    );
    const instructionId = instrRes.rows[0].id;
    createdInstructionIds.push(instructionId);

    resetCapture([{ data: 'ResponseCode=0&Description=Success' }]);
    assert.deepStrictEqual(await recurringService.pauseRecurring(instructionId), { paused: true });
    assert.strictEqual(new URLSearchParams(captured[0].data).get('RecurringPayments.IsActive'), 'false');

    resetCapture([{ data: 'ResponseCode=500&Description=ZZZ_B1 update refused' }]);
    await assert.rejects(() => recurringService.resumeRecurring(instructionId), /ZZZ_B1 update refused/);
    const stillPaused = await db.query('SELECT status FROM recurring_instructions WHERE id = $1', [instructionId]);
    assert.strictEqual(stillPaused.rows[0].status, 'paused', 'a CardCom failure must never be written as local success');

    resetCapture([{ data: 'ResponseCode=0&Description=Success' }]);
    const resumed = await recurringService.resumeRecurring(instructionId);
    assert.ok(resumed.resumed);
    assert.strictEqual(new URLSearchParams(captured[0].data).get('RecurringPayments.IsActive'), 'true');

    resetCapture([{ data: 'ResponseCode=0&Description=Success' }]);
    await recurringService.cancelRecurring(instructionId);
    const cancelled = await db.query('SELECT status FROM recurring_instructions WHERE id = $1', [instructionId]);
    assert.strictEqual(cancelled.rows[0].status, 'cancelled');
  });

  /* ── 6. recurring history through the default seam ──────────────────────── */

  await check('6a. GetRecurringPaymentHistory through the provider is still a GET with a JSON body, no TerminalNumber, timeout 15000', async () => {
    resetCapture([{ data: { ResponseCode: 0, RecurringPaymentHistory: [] } }]);
    await getDonationProvider().getRecurringPaymentHistory({
      apiName: 'n', apiPassword: 'p', accountId: 4337, fromDate: '01092026', toDate: '09102026',
    });
    assert.strictEqual(captured[0].url, EXPECTED_HISTORY_URL);
    assert.strictEqual(captured[0].method, 'get');
    assert.strictEqual(captured[0].timeout, EXPECTED_TIMEOUT);
    assert.strictEqual(captured[0].contentType, 'application/json');
    const body = JSON.parse(captured[0].data);
    assert.deepStrictEqual(body, { apiUserName: 'n', apiPassword: 'p', AccountId: 4337, FromDate: '01092026', ToDate: '09102026' });
    assert.strictEqual('TerminalNumber' in body, false, 'this endpoint has no TerminalNumber field');
  });

  await check('6b. the reconciliation job, with NO getHistory injected, consumes the provider default unchanged', async () => {
    const findingInserts = [];
    const fakeDb = {
      query: async (sql, params) => {
        if (sql.includes("FROM recurring_instructions")) {
          return { rows: [{ id: 'zzz-b1-instr', entity_id: 'zzz-b1-entity', campaign_id: 'zzz-b1-campaign', cardcom_account_id: 4337, cardcom_recurring_id: 24290 }] };
        }
        if (sql.includes('INSERT INTO reconciliation_findings')) {
          findingInserts.push({ findingType: params[1], subjectId: params[4] });
          return { rows: [] };
        }
        if (sql.includes('FROM donations')) return { rows: [] };
        throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 80));
      },
    };
    const finalizeCalls = [];
    resetCapture([{
      data: {
        ResponseCode: 0,
        RecurringPaymentHistory: [{
          RecurringId: 24290, RowID: 141286, TranzactionId: 999888,
          SumToBill: '100.00', CreateDate: '2026-09-15T00:00:00', Status: 'SUCCESSFUL',
        }],
      },
    }]);
    const result = await reconcileAllActiveInstructions(fakeDb, {
      resolveCredentials: async () => ({ apiName: 'n', apiPassword: 'p' }),
      finalizeCharge: async (instr, args) => { finalizeCalls.push({ instr, args }); },
      now: new Date('2026-09-20T12:00:00Z'),
    });
    assert.strictEqual(captured.length, 1, 'the default getHistory must have gone through the provider');
    assert.strictEqual(captured[0].url, EXPECTED_HISTORY_URL);
    assert.strictEqual(result.instructionsChecked, 1);
    assert.strictEqual(result.successfulChargesChecked, 1);
    assert.strictEqual(result.recovered, 1);
    assert.strictEqual(finalizeCalls.length, 1);
    assert.strictEqual(finalizeCalls[0].args.providerReference, '999888');
  });

  /* ── 7. Phase B1 scope guards ───────────────────────────────────────────── */

  await check('7a. the provider facade owns no CardCom request logic of its own — no axios, no URL, no endpoint string', async () => {
    for (const rel of ['src/modules/payment/donation-provider.js', 'src/modules/payment/cardcom/donation.provider.js']) {
      const src = sourceWithoutComments(rel);
      assert.ok(!/require\(['"]axios['"]\)/.test(src), `${rel} must not require axios`);
      assert.ok(!src.includes('cardcom.solutions'), `${rel} must not contain a CardCom URL`);
    }
  });

  await check('7b. Phase B1 ships exactly ONE provider: no simulated/fake/mock donation provider exists anywhere in src/', async () => {
    const hits = [];
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.js') && /simulat|fake/i.test(name)) hits.push(full);
      }
    };
    walk(path.join(__dirname, '..', 'src'));
    assert.deepStrictEqual(hits, [], `unexpected simulated/fake module(s): ${hits.join(', ')}`);
    const providerSrc = sourceWithoutComments('src/modules/payment/donation-provider.js');
    assert.ok(!/simulat/i.test(providerSrc), 'the resolution point must not know about simulation yet');
  });

  await check('7c. HAMONYM_SIMULATION_MODE selects nothing payment-provider related', async () => {
    const providerSrc = sourceWithoutComments('src/modules/payment/donation-provider.js');
    assert.ok(!providerSrc.includes('HAMONYM_SIMULATION_MODE'), 'provider resolution must not read the simulation flag');
    const clockSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'clock.js'), 'utf8');
    assert.ok(!/provider/i.test(clockSrc), 'the clock must not know about payment providers');

    // The flag being ON must not change which provider is handed out.
    const before = getDonationProvider();
    process.env.HAMONYM_SIMULATION_MODE = 'on';
    try {
      assert.strictEqual(getDonationProvider(), before, 'simulation mode must not swap the payment provider');
      assert.strictEqual(getDonationProvider().name, 'cardcom');
    } finally {
      delete process.env.HAMONYM_SIMULATION_MODE;
    }
  });

  await check('7d. donations.service.js no longer talks to axios or holds a CardCom URL at all', async () => {
    const src = sourceWithoutComments('src/modules/donations/donations.service.js');
    assert.ok(!/require\(['"]axios['"]\)/.test(src), 'donations.service.js must no longer require axios');
    assert.ok(!src.includes('cardcom.solutions'), 'donations.service.js must no longer hold a CardCom endpoint URL');
    assert.ok(src.includes('getDonationProvider().createLowProfile'), 'it must go through the seam');
  });

  await check('7e. completed_at / provider_charged_at semantics were not touched by B1 (no donation reached paid in this run)', async () => {
    const res = await db.query(
      `SELECT COUNT(*)::int AS n FROM donations
       WHERE campaign_id = ANY($1::uuid[]) AND (status = 'paid' OR completed_at IS NOT NULL OR provider_charged_at IS NOT NULL)`,
      [[fixture.campaignUnverifiedId, fixture.campaignVerifiedId]]
    );
    assert.strictEqual(res.rows[0].n, 0, 'B1 must not be able to complete or charge-stamp a donation');
  });
}

(async () => {
  try {
    await run();
  } catch (err) {
    failures++;
    console.log('FATAL', err.stack || err.message);
  } finally {
    axios.defaults.adapter = realAdapter;
    unsetDonationFallbackEnv();
    for (const k of Object.keys(PLATFORM_BILLING_SENTINELS)) delete process.env[k];
    await cleanupFixtures();

    await check('cleanup verification: every ZZZ_B1 fixture row is gone', async () => {
      const e = await db.query(`SELECT COUNT(*)::int AS n FROM entities WHERE display_name LIKE 'ZZZ_B1%'`);
      assert.strictEqual(e.rows[0].n, 0, 'ZZZ_B1 entities remain');
      const c = await db.query(`SELECT COUNT(*)::int AS n FROM campaigns WHERE slug LIKE 'zzz-b1-%'`);
      assert.strictEqual(c.rows[0].n, 0, 'ZZZ_B1 campaigns remain');
    });

    console.log(`\n${passed} passed, ${failures} failed`);
    await db.end().catch(() => {});
    process.exit(failures ? 1 : 0);
  }
})();
