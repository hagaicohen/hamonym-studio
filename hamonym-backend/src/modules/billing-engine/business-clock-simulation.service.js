'use strict';
const pool = require('../../db/db');
const clock = require('../../lib/clock');
const scope = require('../../lib/fin11-simulation-context');
const collection = require('./fin11-simulation.service');
const LOCK = 117911076;
function failure(message, status, code) { return Object.assign(new Error(message), { status, code }); }
function collectionAuthorized() {
  try { scope.configuration(); return true; } catch (err) {
    if (err.code === 'FIN11_SIMULATION_FORBIDDEN') return false;
    throw err;
  }
}
async function read(db) {
  try { return (await db.query('SELECT fixed_at, enabled FROM admin_simulation_clock WHERE id = true')).rows[0]; }
  catch (err) {
    if (['42P01', '42703'].includes(err.code)) throw failure('יש להחיל מיגרציה 076 לפני הפעלת שעון הסימולציה', 503, 'SIMULATION_MIGRATION_REQUIRED');
    throw err;
  }
}
async function status(db = pool) {
  const row = await read(db), realNow = clock.realNow();
  const simulationEnabled = row?.enabled === true;
  const overrideActive = simulationEnabled && !!row.fixed_at;
  return { simulationEnabled, overrideActive, businessNow: overrideActive ? row.fixed_at : realNow, realNow,
    collectionAuthorized: collectionAuthorized() };
}
async function change(adminId, action) {
  if (!adminId) throw failure('נדרשת הרשאת מנהל־על', 403, 'SUPER_ADMIN_REQUIRED');
  const client = await pool.connect(); let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK])).rows[0].acquired;
    if (!locked) throw failure('עדכון השעון כבר בתהליך', 409, 'CLOCK_BUSY');
    const row = await read(client);
    await action(client, row);
    return await status(client);
  } finally { if (locked) await client.query('SELECT pg_advisory_unlock($1)', [LOCK]); client.release(); }
}
async function setEnabled(enabled, adminId) {
  if (typeof enabled !== 'boolean') throw failure('נדרש ערך הפעלה תקין', 400, 'INVALID_ENABLED');
  return change(adminId, async client => {
    await client.query(
      'INSERT INTO admin_simulation_clock (enabled, updated_by) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET enabled=$1, updated_by=$2, updated_at=NOW()',
      [enabled, adminId]);
  });
}
async function setFixed(isoDatetime, adminId) {
  if (typeof isoDatetime !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(isoDatetime) || !Number.isFinite(Date.parse(isoDatetime))) throw failure('נדרש תאריך תקין עם אזור זמן מפורש', 400, 'INVALID_TIME');
  const businessAt = new Date(isoDatetime).toISOString();
  let results;
  const state = await change(adminId, async (client, row) => {
    await client.query('INSERT INTO admin_simulation_clock (enabled, fixed_at, updated_by) VALUES (true,$1,$2) ON CONFLICT (id) DO UPDATE SET enabled=true, fixed_at=$1, updated_by=$2, updated_at=NOW()', [businessAt, adminId]);
    // The existing FIN-11 service owns durable dispatch, retry limits and idempotency.
    // No job dispatch occurs when any independent gate is closed.
    if (collectionAuthorized()) results = await collection.advance(businessAt, adminId);
  });
  return { ...state, ...(results ? { results: results.results, skipped: results.skipped } : {}) };
}
async function reset(adminId) {
  return change(adminId, async (client, row) => {
    if (!row?.enabled) throw failure('יש להפעיל תחילה את שעון הסימולציה', 409, 'CLOCK_DISABLED');
    await client.query('UPDATE admin_simulation_clock SET fixed_at=NULL, updated_by=$1, updated_at=NOW() WHERE id=true', [adminId]);
  });
}
module.exports = { status, setEnabled, setFixed, reset };
