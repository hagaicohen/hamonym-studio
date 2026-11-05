// The single effective Hamonym clock. An Admin override changes business time only.
// Scheduler, billing and API use now(); audit facts keep realNow()/SQL NOW().
const UNDEFINED_TABLE = '42P01';

// Always real wall-clock. Ignores simulation entirely — this is what
// operational/audit code should call if it ever needs a Date in JS rather
// than SQL NOW().
function realNow() {
  return new Date();
}

async function now(db) {
  try {
    const row = (await db.query('SELECT enabled, fixed_at FROM admin_simulation_clock WHERE id=true')).rows[0];
    if (row?.enabled && row.fixed_at) return new Date(row.fixed_at);
  } catch (err) {
    if (err.code !== UNDEFINED_TABLE) throw err;
  }
  return realNow();
}
// Compatibility name: both callers read exactly the same effective clock.
const billingNow = now;

// Business calendar date as 'YYYY-MM-DD'.
//
// Derived with LOCAL calendar getters, not toISOString(). Deliberate, and
// consistent with the correction documented in recurring.service.js's
// dayOfMonthFromDate: on a server whose local timezone is ahead of UTC
// (Israel), reading a calendar field through UTC shifts the date backward by
// one for part of every day.
async function today(db) {
  const d = await now(db);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const part = name => parts.find(p => p.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

module.exports = { now, billingNow, today, realNow };
