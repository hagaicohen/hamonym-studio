// Simulation Clock admin surface (2026-10) -- src/lib/simulation-clock-
// admin.js's setFixedTime/setOffset/resetToRealTime (deliberately a
// SEPARATE module from src/lib/clock.js, which its own safety test
// requires to stay physically read-only -- see that file's header), and
// the controller that wraps them. Two halves:
//   A. Against the REAL production pool, simulation OFF (today's actual
//      state everywhere) -- every write function must refuse immediately,
//      with ZERO queries issued, and simulation_clock must never exist.
//   B. Against the genuinely isolated test Postgres container, simulation
//      ON -- the full set/read/reset lifecycle, proving these are the
//      exact same semantics scripts/test-business-clock.js already proved
//      for the underlying table/SQL (this file does not re-prove clock.js's
//      own read-path behavior, already covered there).
const assert = require('assert');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

async function partA() {
  require('dotenv').config();
  delete process.env.HAMONYM_SIMULATION_MODE;
  const pool = require('../src/db/db');
  const clock = require('../src/lib/clock');
  const clockAdmin = require('../src/lib/simulation-clock-admin');

  const explodingDb = { query: () => { throw new Error('a write function queried the database while simulation was OFF'); } };

  check('A0. precondition: simulation is genuinely OFF in this process', clock.isSimulationEnabled() === false);

  for (const [label, fn] of [
    ['setFixedTime', () => clockAdmin.setFixedTime(explodingDb, '2031-01-01T00:00:00.000Z')],
    ['setOffset', () => clockAdmin.setOffset(explodingDb, 1000)],
    ['resetToRealTime', () => clockAdmin.resetToRealTime(explodingDb)],
    ['createSimulationClockTable', () => clockAdmin.createSimulationClockTable(explodingDb)],
  ]) {
    try {
      await fn();
      check(`A1. ${label}() throws SimulationDisabledError when simulation is OFF (never reaches the db)`, false, 'did not throw');
    } catch (err) {
      check(`A1. ${label}() throws SimulationDisabledError when simulation is OFF (never reaches the db)`, err.code === 'SIMULATION_DISABLED', err.message);
    }
  }

  const tableCheck = await pool.query(`SELECT to_regclass('public.simulation_clock') AS t`);
  check('A2. simulation_clock does not exist in the real production database', tableCheck.rows[0].t === null, JSON.stringify(tableCheck.rows[0]));

  await pool.end();
}

async function partB() {
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5433';
  process.env.DB_NAME = 'hamonym_test';
  process.env.DB_USER = 'postgres';
  process.env.DB_PASSWORD = 'testpass';
  process.env.DB_SSL = 'false';
  process.env.HAMONYM_SIMULATION_MODE = 'on';

  delete require.cache[require.resolve('../src/db/db')];
  delete require.cache[require.resolve('../src/lib/clock')];
  delete require.cache[require.resolve('../src/lib/simulation-clock-admin')];
  const pool = require('../src/db/db');
  const clock = require('../src/lib/clock');
  const clockAdmin = require('../src/lib/simulation-clock-admin');

  check('B0. precondition: simulation is genuinely ON in this process', clock.isSimulationEnabled() === true);

  await pool.query(`DROP TABLE IF EXISTS simulation_clock`);

  try {
    await clockAdmin.setFixedTime(pool, '2033-05-10T08:00:00.000Z');
    const n1 = await clock.now(pool);
    check('B1. setFixedTime creates the table on demand and freezes business time exactly there', n1.toISOString() === '2033-05-10T08:00:00.000Z', n1.toISOString());

    const d1 = await clock.today(pool);
    check('B2. today() reflects the fixed simulated date', d1 === '2033-05-10', d1);

    const offset = 10 * 24 * 60 * 60 * 1000;
    await clockAdmin.setOffset(pool, offset);
    const n2 = await clock.now(pool);
    check('B3. setOffset switches from fixed to a real-time-relative offset (fixed_at cleared)', Math.abs(n2.getTime() - (Date.now() + offset)) < 5000, n2.toISOString());

    await clockAdmin.resetToRealTime(pool);
    const n3 = await clock.now(pool);
    check('B4. resetToRealTime removes the override -- business time is real wall-clock again', Math.abs(n3.getTime() - Date.now()) < 2000, n3.toISOString());

    const rowGone = await pool.query(`SELECT count(*) FROM simulation_clock`);
    check('B5. reset leaves zero rows (not a zeroed row)', Number(rowGone.rows[0].count) === 0, rowGone.rows[0].count);

    check('B6. real wall-clock (realNow) never moved across any of this', Math.abs(clock.realNow().getTime() - Date.now()) < 1000);

    await assert.rejects(() => clockAdmin.setFixedTime(pool, 'not-a-real-date-but-controller-validates-this'), () => true);
  } finally {
    await pool.query(`DROP TABLE IF EXISTS simulation_clock`).catch(() => {});
    delete process.env.HAMONYM_SIMULATION_MODE;
    await pool.end();
  }
}

async function main() {
  await partA();
  await partB();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== TOTAL: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) console.log('FAILURES:', failed);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
