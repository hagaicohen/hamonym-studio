// Simulation Clock ADMIN write surface (2026-10, Super Admin "כלי
// סימולציה"). Deliberately a SEPARATE module from src/lib/clock.js, never
// the other way around -- clock.js's own safety test (scripts/test-
// business-clock-safety.js, "D2"/"D3") asserts it is physically read-only
// (zero write verbs, exactly four pure-reader exports) and that invariant
// must never be touched. This file is the one place allowed to WRITE the
// simulation_clock table that clock.js only ever READS; clock.js does not
// import this file, and nothing in clock.js changes.
//
// Every function here is a direct promotion of scripts/test-business-
// clock.js's own private helpers (createSimulationClockTable /
// setFixedBusinessTime / setBusinessTimeOffset) -- the exact SQL that test
// already proved correct against a real Postgres round-trip, not a
// reimplementation.
//
// SAFETY: every function re-checks isSimulationEnabled() for itself and
// throws BEFORE issuing a single query otherwise -- the caller
// (simulation-clock.controller.js) checks this too, but this module must
// never be the one piece that trusts a caller's gating. In production,
// where HAMONYM_SIMULATION_MODE is never 'on' (donation-provider.js's own
// comment: the clock moves business-time decisions, never money; and
// test-business-clock.js's own header: this table "must never exist in a
// production database"), every function below throws immediately -- the
// table is never created, read, or written in production, structurally.
const { isSimulationEnabled } = require('./clock');

class SimulationDisabledError extends Error {
  constructor() {
    super('Simulation mode is not enabled in this environment');
    this.code = 'SIMULATION_DISABLED';
  }
}

function assertSimulationEnabled() {
  if (!isSimulationEnabled()) throw new SimulationDisabledError();
}

async function createSimulationClockTable(db) {
  assertSimulationEnabled();
  await db.query(`
    CREATE TABLE IF NOT EXISTS simulation_clock (
      id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      offset_ms  bigint NOT NULL DEFAULT 0,
      fixed_at   timestamptz,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )`);
}

// Freeze simulated business time at an exact instant.
async function setFixedTime(db, isoDatetime) {
  assertSimulationEnabled();
  await createSimulationClockTable(db);
  await db.query(
    `INSERT INTO simulation_clock (id, offset_ms, fixed_at, updated_at)
     VALUES (1, 0, $1::timestamptz, NOW())
     ON CONFLICT (id) DO UPDATE SET offset_ms = 0, fixed_at = EXCLUDED.fixed_at, updated_at = NOW()`,
    [isoDatetime]
  );
}

// Shift simulated business time relative to real wall-clock (business time
// still flows at wall-clock speed, just offset).
async function setOffset(db, offsetMs) {
  assertSimulationEnabled();
  await createSimulationClockTable(db);
  await db.query(
    `INSERT INTO simulation_clock (id, offset_ms, fixed_at, updated_at)
     VALUES (1, $1, NULL, NOW())
     ON CONFLICT (id) DO UPDATE SET offset_ms = EXCLUDED.offset_ms, fixed_at = NULL, updated_at = NOW()`,
    [offsetMs]
  );
}

// Back to real wall-clock -- removes the override row entirely (rather than
// zeroing it in place) so clock.now() takes the already-proven "no row
// present -> real time" path.
async function resetToRealTime(db) {
  assertSimulationEnabled();
  await db.query(`DELETE FROM simulation_clock WHERE id = 1`).catch((err) => {
    if (err && err.code === '42P01') return; // table doesn't exist -- nothing to reset
    throw err;
  });
}

module.exports = {
  setFixedTime, setOffset, resetToRealTime, createSimulationClockTable,
  SimulationDisabledError,
};
