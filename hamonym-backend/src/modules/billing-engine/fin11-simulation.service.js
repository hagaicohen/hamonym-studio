'use strict';
const pool = require('../../db/db');
const clock = require('../../lib/clock');
const scope = require('../../lib/fin11-simulation-context');
const jobs = require('../../jobs');
const monthly = require('./fin11-simulation-monthly.service');
const LOCK = 117911075;
async function status() {
  const realNow = clock.realNow();
  if (!scope.enabled()) return { simulationEnabled: false, overrideActive: false, businessNow: realNow, realNow };
  scope.configuration();
  const { rows } = await pool.query('SELECT business_at, pending FROM fin11_simulation_clock WHERE id = true');
  return { simulationEnabled: true, overrideActive: !!rows[0], businessNow: rows[0]?.business_at || realNow, realNow, pending: rows[0]?.pending || false };
}
async function advance(isoDatetime, superAdminUserId) {
  const config = scope.configuration();
  if (!superAdminUserId) throw Object.assign(new Error('Super Admin required'), { status: 403 });
  if (typeof isoDatetime !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(isoDatetime) || !Number.isFinite(Date.parse(isoDatetime))) throw Object.assign(new Error('Explicit timezone required'), { status: 400 });
  const businessAt = new Date(isoDatetime).toISOString();
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK])).rows[0].acquired;
    if (!locked) throw Object.assign(new Error('Clock advancement already processing'), { status: 409 });
    const previous = (await client.query('SELECT business_at, pending, entity_ids, identity_fingerprint FROM fin11_simulation_clock WHERE id = true')).rows[0];
    if (previous && new Date(previous.business_at) > new Date(businessAt)) throw Object.assign(new Error('FIN-11 clock cannot move backwards'), { status: 409 });
    if (previous && new Date(previous.business_at).getTime() === new Date(businessAt).getTime()
        && !previous.pending && previous.identity_fingerprint === config.fingerprint
        && [...previous.entity_ids].sort().join(',') === [...config.entityIds].sort().join(',')) {
      return { ...(await status()), results: [], skipped: 'already_dispatched' };
    }
    await client.query(
      'INSERT INTO fin11_simulation_clock (business_at, entity_ids, identity_fingerprint, super_admin_user_id) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET business_at=$1, entity_ids=$2, identity_fingerprint=$3, super_admin_user_id=$4, pending=true, updated_at=NOW()',
      [businessAt, config.entityIds, config.fingerprint, superAdminUserId]);
    const results = await scope.run({ businessAt, entityIds: config.entityIds, fingerprint: config.fingerprint }, async () => {
      const result = [];
      let prepared;
      try { prepared = await monthly.prepare(new Date(businessAt), previous?.business_at); }
      catch (err) { prepared = { status: 'blocked', reason: err.code || 'monthly_preparation_failed' }; }
      result.push({ step: 'monthly_billing', status: prepared.status, result: prepared });
      if (prepared.status !== 'success') return result;
      try { result.push({ step: 'recover_mock_attempts', status: 'success', result: await monthly.recover() }); }
      catch { result.push({ step: 'recover_mock_attempts', status: 'blocked', result: { reason: 'mock_recovery_failed' } }); return result; }
      // Each existing job retains its date/lock/attempt guards; never loop over missed slots.
      for (const name of ['fin11-card-collection', 'fin11-card-retry-sweep']) {
        let outcome;
        try { outcome = await jobs.run(name, { triggeredBy: 'fin11-simulation-clock:' + superAdminUserId }); }
        catch { outcome = { status: 'failed', result: { reason: 'simulation_job_failed' } }; }
        result.push({ step: name, ...outcome });
        if (outcome.status !== 'success' || outcome.result?.errors) break;
      }
      return result;
    });
    if (results.every(r => (r.status === 'success' || r.status === 'skipped') && !r.result?.errors?.length && !Number(r.result?.errors))) await client.query('UPDATE fin11_simulation_clock SET pending=false WHERE id=true');
    return { ...(await status()), results };
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [LOCK]);
    client.release();
  }
}
module.exports = { status, advance };
