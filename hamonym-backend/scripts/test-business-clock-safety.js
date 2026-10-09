// Business clock SAFETY proof (Phase A, 2026-10-09).
//
// THE single most important property of the whole business-clock design:
//
//     Moving simulated business time, by itself, does nothing.
//
// It must not contact CardCom, must not create a donation, a payment or a
// receipt, must not mark anything paid, and must not send an email. The
// clock is a value that decision code READS; it is not a trigger, has no
// scheduler, and holds no outbound capability of any kind.
//
// This is asserted four independent ways rather than argued from code
// reading:
//
//   A. OUTBOUND NETWORK TRAP. http.request/https.request/global fetch are
//      replaced with recorders that throw. Any CardCom (or any other HTTP)
//      call attempted while business time is being moved is therefore
//      recorded AND fatal. pg uses raw TCP sockets, not http, so the
//      database keeps working and the trap stays specific to outbound HTTP.
//   B. CARDCOM CLIENT TRAP. Every exported function of both CardCom clients
//      (cardcom.client.js, recurring.client.js) is replaced with a recorder
//      that throws, so a call that somehow bypassed HTTP is still caught.
//   C. FINANCIAL-STATE SNAPSHOT. Exact row counts and aggregates for
//      donations (total and 'paid'), payments, receipts,
//      collection_attempts, recurring_instructions, statements and
//      email_logs are captured before, compared after. Byte-identical is
//      the pass condition.
//   D. STRUCTURAL. src/lib/clock.js has zero requires and contains no
//      INSERT/UPDATE/DELETE at all -- it is physically read-only and cannot
//      reach any financial module.
//
// Business time is moved aggressively during the test: frozen a year ahead,
// offset by +400 days, pushed past several monthly billing cutoffs, and set
// back again -- the kind of jump that WOULD matter if anything were
// listening. Nothing is listening, and that is what this file proves.
//
// Run: node scripts/test-business-clock-safety.js

require('dotenv').config();
delete process.env.HAMONYM_SIMULATION_MODE;

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const pool = require('../src/db/db');
const clock = require('../src/lib/clock');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

// ---- A. outbound HTTP trap -------------------------------------------------
const outboundCalls = [];
const realHttpRequest = http.request;
const realHttpsRequest = https.request;
const realHttpGet = http.get;
const realHttpsGet = https.get;
const realFetch = global.fetch;

function installNetworkTrap() {
  const trap = (label) => (...args) => {
    const target = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].hostname) || '<unknown>';
    outboundCalls.push(`${label} -> ${target}`);
    throw new Error(`FORBIDDEN outbound call during clock manipulation: ${label} -> ${target}`);
  };
  http.request = trap('http.request');
  https.request = trap('https.request');
  http.get = trap('http.get');
  https.get = trap('https.get');
  global.fetch = trap('fetch');
}

function removeNetworkTrap() {
  http.request = realHttpRequest;
  https.request = realHttpsRequest;
  http.get = realHttpGet;
  https.get = realHttpsGet;
  global.fetch = realFetch;
}

// ---- B. CardCom client trap ------------------------------------------------
const cardcomCalls = [];

function installCardcomTrap() {
  const modules = [
    ['cardcom.client', require('../src/modules/payment/cardcom/cardcom.client')],
    ['recurring.client', require('../src/modules/payment/cardcom/recurring.client')],
    // Phase B1: LowProfile/Create moved out of donations.service.js into its
    // own client — trapped here too so the donation rail's entry point stays
    // covered by this test, not only by the raw http/https trap.
    ['lowprofile.client', require('../src/modules/payment/cardcom/lowprofile.client')],
  ];
  for (const [label, mod] of modules) {
    for (const key of Object.keys(mod)) {
      if (typeof mod[key] !== 'function') continue;
      mod[key] = (...args) => {
        cardcomCalls.push(`${label}.${key}`);
        throw new Error(`FORBIDDEN CardCom call during clock manipulation: ${label}.${key}`);
      };
    }
  }
  return modules.reduce((n, [, mod]) => n + Object.keys(mod).filter((k) => typeof mod[k] === 'function').length, 0);
}

// ---- C. financial-state snapshot ------------------------------------------
async function snapshotFinancialState() {
  const q = async (sql) => (await pool.query(sql)).rows[0];
  const [donations, payments, receipts, attempts, instructions, statements, emails] = await Promise.all([
    q(`SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
              COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed,
              COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::text AS paid_sum
       FROM donations`),
    q(`SELECT COUNT(*)::int AS total, COALESCE(SUM(amount), 0)::text AS sum FROM payments`),
    q(`SELECT COUNT(*)::int AS total FROM receipts`),
    q(`SELECT COUNT(*)::int AS total FROM collection_attempts`),
    q(`SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'active')::int AS active
       FROM recurring_instructions`),
    q(`SELECT COUNT(*)::int AS total FROM statements`),
    q(`SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'sent')::int AS sent
       FROM email_logs`),
  ]);
  return { donations, payments, receipts, attempts, instructions, statements, emails };
}

async function createSimulationClockTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS simulation_clock (
      id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      offset_ms  bigint NOT NULL DEFAULT 0,
      fixed_at   timestamptz,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )`);
}

async function setFixedBusinessTime(iso) {
  await pool.query(
    `INSERT INTO simulation_clock (id, offset_ms, fixed_at, updated_at)
     VALUES (1, 0, $1::timestamptz, NOW())
     ON CONFLICT (id) DO UPDATE SET offset_ms = 0, fixed_at = EXCLUDED.fixed_at, updated_at = NOW()`,
    [iso]
  );
}

async function setBusinessTimeOffset(offsetMs) {
  await pool.query(
    `INSERT INTO simulation_clock (id, offset_ms, fixed_at, updated_at)
     VALUES (1, $1, NULL, NOW())
     ON CONFLICT (id) DO UPDATE SET offset_ms = EXCLUDED.offset_ms, fixed_at = NULL, updated_at = NOW()`,
    [offsetMs]
  );
}

async function main() {
  let tableCreated = false;
  let trapInstalled = false;

  try {
    // ---- D. structural proof (no DB, no traps needed) -------------------
    await check('D1. src/lib/clock.js has ZERO requires -- it cannot reach CardCom, donations, receipts or email even in principle', async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'clock.js'), 'utf8');
      const requires = src.match(/require\s*\(/g) || [];
      assert.deepStrictEqual(requires, [], `expected zero requires, found ${requires.length}`);
    });

    await check('D2. src/lib/clock.js is physically read-only: no INSERT, UPDATE, DELETE, or any write verb anywhere in the module', async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'clock.js'), 'utf8');
      for (const verb of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'UPSERT', 'ON CONFLICT']) {
        assert.ok(!src.includes(verb), `clock.js must contain no ${verb}`);
      }
      const selects = src.match(/SELECT/g) || [];
      assert.strictEqual(selects.length, 1, 'exactly one SELECT (the simulation_clock read) and nothing else');
    });

    await check('D3. src/lib/clock.js exposes no HTTP, no scheduler, no timer -- it cannot initiate anything', async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'clock.js'), 'utf8');
      for (const token of ['setInterval', 'setTimeout', 'setImmediate', 'http', 'axios', 'fetch', 'cron']) {
        assert.ok(!new RegExp(`\\b${token}\\b`).test(src.replace(/\/\/.*$/gm, '')),
          `clock.js must not reference ${token}`);
      }
      assert.deepStrictEqual(Object.keys(require('../src/lib/clock')).sort(),
        ['isSimulationEnabled', 'now', 'realNow', 'today'], 'clock exports exactly four pure readers');
    });

    // ---- set up the simulated clock, then snapshot everything -----------
    await createSimulationClockTable();
    tableCreated = true;

    const before = await snapshotFinancialState();
    console.log('\n  financial snapshot BEFORE:', JSON.stringify(before));

    const trappedFns = installCardcomTrap();
    installNetworkTrap();
    trapInstalled = true;

    // ---- now move business time around as violently as possible ---------
    process.env.HAMONYM_SIMULATION_MODE = 'on';

    const movements = [];

    await check('S1. freeze business time one year ahead -- no outbound call, no CardCom call', async () => {
      await setFixedBusinessTime('2031-03-07T09:15:00.000Z');
      const n = await clock.now(pool);
      movements.push(n.toISOString());
      assert.strictEqual(n.toISOString(), '2031-03-07T09:15:00.000Z');
      assert.deepStrictEqual(outboundCalls, [], 'outbound HTTP attempted');
      assert.deepStrictEqual(cardcomCalls, [], 'CardCom client invoked');
    });

    await check('S2. offset business time by +400 days -- still nothing initiated', async () => {
      await setBusinessTimeOffset(400 * 24 * 60 * 60 * 1000);
      const n = await clock.now(pool);
      movements.push(n.toISOString());
      assert.ok(n.getTime() > Date.now() + 399 * 24 * 60 * 60 * 1000);
      assert.deepStrictEqual(outboundCalls, []);
      assert.deepStrictEqual(cardcomCalls, []);
    });

    await check('S3. step business time across FIVE consecutive monthly billing cutoffs -- the single most "tempting" jump for an automated charge, and still nothing happens', async () => {
      for (const iso of [
        '2031-07-28T18:00:00.001Z',
        '2031-08-28T17:00:00.001Z',
        '2031-09-28T17:00:00.001Z',
        '2031-10-28T18:00:00.001Z',
        '2031-11-28T18:00:00.001Z',
      ]) {
        await setFixedBusinessTime(iso);
        const n = await clock.now(pool);
        movements.push(n.toISOString());
        assert.strictEqual(n.toISOString(), iso);
      }
      assert.deepStrictEqual(outboundCalls, [], 'crossing a billing cutoff must not contact anyone');
      assert.deepStrictEqual(cardcomCalls, [], 'crossing a billing cutoff must not call CardCom');
    });

    await check('S4. push business time far past every recurring charge date for a year, then set it BACK -- both directions are inert', async () => {
      await setBusinessTimeOffset(3 * 365 * 24 * 60 * 60 * 1000);
      movements.push((await clock.now(pool)).toISOString());
      await setFixedBusinessTime('2019-01-01T00:00:00.000Z');
      movements.push((await clock.now(pool)).toISOString());
      await setBusinessTimeOffset(0);
      movements.push((await clock.now(pool)).toISOString());
      assert.deepStrictEqual(outboundCalls, []);
      assert.deepStrictEqual(cardcomCalls, []);
    });

    await check('S5. let the event loop drain after all that movement -- no deferred timer, setImmediate or queued dispatch fires either', async () => {
      await new Promise((r) => setTimeout(r, 1500));
      assert.deepStrictEqual(outboundCalls, [], `deferred outbound calls fired: ${outboundCalls.join(', ')}`);
      assert.deepStrictEqual(cardcomCalls, [], `deferred CardCom calls fired: ${cardcomCalls.join(', ')}`);
    });

    // ---- the decisive assertions ----------------------------------------
    removeNetworkTrap();
    trapInstalled = false;

    const after = await snapshotFinancialState();
    console.log('  financial snapshot AFTER :', JSON.stringify(after));
    console.log(`  business-time movements applied: ${movements.length}`);

    await check('S6. CRITICAL -- no donation was created and nothing was marked paid: donations total/paid/pending/completed counts and the paid amount SUM are byte-identical', async () => {
      assert.deepStrictEqual(after.donations, before.donations,
        `donations changed:\n  before ${JSON.stringify(before.donations)}\n  after  ${JSON.stringify(after.donations)}`);
    });

    await check('S7. CRITICAL -- no payment was created: payments count and SUM are byte-identical', async () => {
      assert.deepStrictEqual(after.payments, before.payments);
    });

    await check('S8. CRITICAL -- no receipt was issued: receipts count is byte-identical', async () => {
      assert.deepStrictEqual(after.receipts, before.receipts);
    });

    await check('S9. CRITICAL -- no collection attempt was initiated and no recurring instruction changed state', async () => {
      assert.deepStrictEqual(after.attempts, before.attempts);
      assert.deepStrictEqual(after.instructions, before.instructions);
    });

    await check('S10. CRITICAL -- no statement was produced and no email was sent', async () => {
      assert.deepStrictEqual(after.statements, before.statements);
      assert.deepStrictEqual(after.emails, before.emails);
    });

    await check('S11. CRITICAL -- across every business-time movement, outbound HTTP calls: 0, and CardCom client calls: 0', async () => {
      assert.strictEqual(outboundCalls.length, 0, `outbound: ${outboundCalls.join(', ')}`);
      assert.strictEqual(cardcomCalls.length, 0, `cardcom: ${cardcomCalls.join(', ')}`);
      assert.ok(movements.length >= 10, `expected many time movements, got ${movements.length}`);
      assert.ok(trappedFns > 0, 'the CardCom trap must actually have replaced some functions');
    });

    await check('S12. the traps are real, not decorative: a deliberate CardCom client call DOES get caught', async () => {
      const cardcomClient = require('../src/modules/payment/cardcom/cardcom.client');
      const fnName = Object.keys(cardcomClient).find((k) => typeof cardcomClient[k] === 'function');
      assert.ok(fnName, 'cardcom.client must export at least one function to trap');
      assert.throws(() => cardcomClient[fnName]({}), /FORBIDDEN CardCom call/);
      assert.strictEqual(cardcomCalls.length, 1, 'the deliberate probe must be the FIRST and only recorded call');
      cardcomCalls.length = 0;
    });

    await check('S13. the network trap is real too: a deliberate https.request DOES get caught', async () => {
      installNetworkTrap();
      assert.throws(() => https.request('https://example.invalid'), /FORBIDDEN outbound call/);
      assert.strictEqual(outboundCalls.length, 1);
      removeNetworkTrap();
      outboundCalls.length = 0;
    });

    await check('S14. real wall-clock was never moved by any of this: realNow() and the database\'s own NOW() are both still present-day', async () => {
      assert.ok(Math.abs(clock.realNow().getTime() - Date.now()) < 1000);
      const dbNow = await pool.query(`SELECT NOW() AS n`);
      const skew = Math.abs(new Date(dbNow.rows[0].n).getTime() - Date.now());
      assert.ok(skew < 5 * 60 * 1000, `database clock moved (skew ${skew}ms)`);
    });
  } finally {
    if (trapInstalled) removeNetworkTrap();
    delete process.env.HAMONYM_SIMULATION_MODE;
    if (tableCreated) await pool.query(`DROP TABLE IF EXISTS simulation_clock`).catch(() => {});

    await check('cleanup verification: the throwaway simulation_clock table is gone and simulation is OFF', async () => {
      const t = await pool.query(`SELECT to_regclass('public.simulation_clock') AS t`);
      assert.strictEqual(t.rows[0].t, null, 'simulation_clock must NOT remain in the database');
      assert.strictEqual(clock.isSimulationEnabled(), false);
    });
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  removeNetworkTrap();
  await pool.query(`DROP TABLE IF EXISTS simulation_clock`).catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
