// Super Admin "כלי סימולציה" (2026-10) -- a thin HTTP surface over the
// EXISTING src/lib/clock.js (reads) and the separate src/lib/simulation-
// clock-admin.js (writes -- kept out of clock.js itself, which its own
// safety test requires to stay physically read-only). No business-time
// logic lives here; every decision (is simulation on, what business time
// means, what writing is allowed) stays entirely in those two modules. See
// their own headers for why this is safe by construction even if this
// controller were ever mounted somewhere unguarded: every write function
// re-checks isSimulationEnabled() for itself and throws before issuing a
// single query otherwise.
const pool = require('../../../db/db');
const clock = require('../../../lib/clock');
const clockAdmin = require('../../../lib/simulation-clock-admin');

function handleClockError(res, err) {
  if (err instanceof clockAdmin.SimulationDisabledError || err.code === 'SIMULATION_DISABLED') {
    return res.status(403).json({ error: err.message, code: 'SIMULATION_DISABLED' });
  }
  console.error('[simulation-clock] error:', err.message);
  res.status(500).json({ error: 'Simulation clock operation failed' });
}

// `overrideActive` (2026-10, "clearly display which mode is active") --
// derived, not a second query: whenever a simulated override is genuinely
// in effect, businessNow and realNow diverge by more than normal query
// latency ever could. A >2s gap can only mean a real fixed_at/offset_ms
// row, never measurement noise -- this is the one honest signal for
// "is the clock actually overridden right now", independent of whether
// this environment is merely CAPABLE of simulation (simulationEnabled).
function buildStatusPayload(simulationEnabled, businessNow, realNow) {
  const overrideActive = simulationEnabled && Math.abs(businessNow.getTime() - realNow.getTime()) > 2000;
  return {
    simulationEnabled,
    overrideActive,
    businessNow: businessNow.toISOString(),
    realNow: realNow.toISOString(),
  };
}

// Always safe to call: clock.now()/clock.realNow() issue zero queries
// whenever simulation is off (the real production/every-environment-today
// state) -- see clock.js's own documented zero-query guarantee.
exports.getStatus = async (req, res) => {
  try {
    const simulationEnabled = clock.isSimulationEnabled();
    const [businessNow, real] = await Promise.all([
      clock.now(pool),
      Promise.resolve(clock.realNow()),
    ]);
    res.json(buildStatusPayload(simulationEnabled, businessNow, real));
  } catch (err) {
    console.error('[simulation-clock] getStatus error:', err.message);
    res.status(500).json({ error: 'Failed to read the business clock' });
  }
};

exports.setFixed = async (req, res) => {
  try {
    const isoDatetime = req.body.isoDatetime;
    if (!isoDatetime || Number.isNaN(new Date(isoDatetime).getTime())) {
      return res.status(400).json({ error: 'A valid isoDatetime is required', code: 'INVALID_DATETIME' });
    }
    await clockAdmin.setFixedTime(pool, isoDatetime);
    const businessNow = await clock.now(pool);
    res.json(buildStatusPayload(true, businessNow, clock.realNow()));
  } catch (err) {
    handleClockError(res, err);
  }
};

exports.setOffset = async (req, res) => {
  try {
    const offsetMs = Number(req.body.offsetMs);
    if (!Number.isFinite(offsetMs)) {
      return res.status(400).json({ error: 'A numeric offsetMs is required', code: 'INVALID_OFFSET' });
    }
    await clockAdmin.setOffset(pool, offsetMs);
    const businessNow = await clock.now(pool);
    res.json(buildStatusPayload(true, businessNow, clock.realNow()));
  } catch (err) {
    handleClockError(res, err);
  }
};

exports.reset = async (req, res) => {
  try {
    await clockAdmin.resetToRealTime(pool);
    const businessNow = await clock.now(pool);
    res.json(buildStatusPayload(clock.isSimulationEnabled(), businessNow, clock.realNow()));
  } catch (err) {
    handleClockError(res, err);
  }
};
