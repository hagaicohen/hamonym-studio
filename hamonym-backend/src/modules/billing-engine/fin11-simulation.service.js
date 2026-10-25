"use strict";
// Compatibility entry for the existing Admin route; no separate clock or billing logic.
const pool = require('../../db/db');
const clock = require('../../lib/clock');
async function status() {
  const businessNow = await clock.now(pool), realNow = clock.realNow();
  return { businessNow, realNow };
}
async function advance(isoDatetime, superAdminUserId) {
  if (!superAdminUserId) throw Object.assign(new Error('Super Admin required'), { status: 403 });
  if (typeof isoDatetime !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(isoDatetime) || !Number.isFinite(Date.parse(isoDatetime))) throw Object.assign(new Error('Explicit timezone required'), { status: 400 });
  return require('./monthly-billing-orchestrator.service').execute({ triggeredBy: 'business-clock:' + superAdminUserId });
}
module.exports = { status, advance };
