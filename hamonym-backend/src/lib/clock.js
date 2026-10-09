// Business-time clock (Phase A, 2026-10-09).
//
// Separates two kinds of "now" that this codebase had silently fused into a
// single `new Date()` / SQL `NOW()`:
//
//   BUSINESS time  — the time a business DECISION is made against: "is this
//                    pending donation old enough to investigate", "which
//                    calendar day should the next recurring charge land on",
//                    "has this month's billing cutoff passed". These are the
//                    only things this module is allowed to move.
//   OPERATIONAL /  — when a row was physically written, when a job started,
//   AUDIT time       when a webhook was received, when a donation was
//                    actually paid (donations.completed_at). These are facts
//                    about reality and must ALWAYS be real wall-clock, under
//                    every configuration. Use realNow(), or leave the SQL
//                    NOW() exactly where it is.
//
// Why DB-backed and not an in-process offset: jobs can run in a completely
// separate OS process from the API (Render Cron), so an in-memory offset
// would be invisible to half the system and the two halves would disagree
// about what day it is. The database is the only shared source of truth
// both processes already have. For the same reason there is deliberately no
// module-level mutable cache layered on top of the table — one row, read on
// demand, is the whole state.
//
// Why no global Date patching (no sinon.useFakeTimers, no Date.now
// override): that would move OPERATIONAL time too, which is exactly the
// thing that must never move. The whole value of this module is that it
// CANNOT affect an audit timestamp even by accident.
//
// Advancing business time does not, by itself, cause anything to happen: it
// has no scheduler, no trigger, no outbound call. It only changes the answer
// a decision function gets when something else asks. See
// scripts/test-business-clock-safety.js, which asserts exactly that.

const SIMULATION_FLAG = 'on';
const UNDEFINED_TABLE = '42P01';

// Exact-string check, deliberately strict. 'true', '1', 'ON', 'test' and an
// unset variable all mean OFF. A typo must fail closed (production
// behavior), never half-enable a simulated clock.
function isSimulationEnabled() {
  return process.env.HAMONYM_SIMULATION_MODE === SIMULATION_FLAG;
}

// Always real wall-clock. Ignores simulation entirely — this is what
// operational/audit code should call if it ever needs a Date in JS rather
// than SQL NOW().
function realNow() {
  return new Date();
}

// Business time.
//
// Simulation OFF (the production path): returns new Date() immediately and
// issues ZERO database queries, so this is a drop-in replacement for
// `new Date()` with no added latency and no added failure mode.
//
// Simulation ON: reads the single simulation_clock row.
//   - fixed_at IS NOT NULL -> business time is frozen exactly there
//     (deterministic; two calls a second apart return the same instant).
//   - otherwise            -> business time is real now + offset_ms
//     (business time still flows at wall-clock speed, just shifted).
//
// Fallback when simulation is ON but there is nothing to read — no row, or
// the simulation_clock table does not exist in this database at all: fall
// back to real wall-clock. Chosen over throwing because a throw here would
// surface deep inside unrelated business logic (a donation page, a billing
// job) as an opaque failure that looks like a real incident. Degrading to
// real time means the worst case of a half-configured simulation is
// "behaves exactly like production", which is the safe direction. Only the
// specific undefined_table error is swallowed; a genuine connectivity or
// permission failure still propagates, so a broken database is never
// disguised as a missing clock.
async function now(db) {
  if (!isSimulationEnabled()) return new Date();

  let res;
  try {
    res = await db.query(
      `SELECT offset_ms, fixed_at FROM simulation_clock WHERE id = 1`
    );
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) return new Date();
    throw err;
  }

  const row = res.rows[0];
  if (!row) return new Date();

  if (row.fixed_at) return new Date(row.fixed_at);

  return new Date(Date.now() + Number(row.offset_ms || 0));
}

// Business calendar date as 'YYYY-MM-DD'.
//
// Derived with LOCAL calendar getters, not toISOString(). Deliberate, and
// consistent with the correction documented in recurring.service.js's
// dayOfMonthFromDate: on a server whose local timezone is ahead of UTC
// (Israel), reading a calendar field through UTC shifts the date backward by
// one for part of every day.
async function today(db) {
  const d = await now(db);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = { now, today, realNow, isSimulationEnabled };
