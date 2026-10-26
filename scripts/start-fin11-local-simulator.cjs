'use strict';
// Local UI sandbox only. Never loads .env or production credentials.
const Module = require('node:module');
const path = require('node:path');
const crypto = require('node:crypto');
process.env.NODE_PATH = path.resolve(__dirname, '../../hamonym-backend/node_modules');
Module._initPaths();
const root = process.env.HAMONYM_ADMIN_BACKEND_ROOT;
if (!root) throw new Error('HAMONYM_ADMIN_BACKEND_ROOT is required');
for (const key of Object.keys(process.env)) if (/CARDCOM|DATABASE_URL|SUPABASE|JWT_SECRET/.test(key)) delete process.env[key];
Object.assign(process.env, {
  DB_HOST: '127.0.0.1', DB_PORT: '5433', DB_NAME: 'hamonym_fin11_simulator_ui',
  DB_USER: 'postgres', DB_PASSWORD: 'testpass', DB_SSL: 'false', PORT: '3000',
  HAMONYM_SIMULATION_MODE: 'on', FIN11_SIMULATION_COLLECTION_ENABLED: 'true',
  FIN11_SIMULATION_PAYMENT_PROVIDER: 'mock', FIN11_SIMULATION_AUTO_APPROVAL_ENABLED: 'true',
  FIN11_AUTO_APPROVAL_ENABLED: 'false', ENABLE_JOB_SCHEDULER: 'false', EMAIL_PROVIDER: 'stub',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'local-simulator-no-storage-access',
});
// Prevent outbound provider calls even if an unrelated route is invoked.
for (const protocol of ['node:http', 'node:https']) {
  const client = require(protocol);
  const request = client.request;
  client.request = function (...args) {
    const target = args[0];
    const host = typeof target === 'string' || target instanceof URL
      ? new URL(target).hostname : (target.hostname || target.host || 'localhost');
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('External HTTP is disabled in the local simulator');
    return request.apply(this, args);
  };
}
const connect = require('node:net').Socket.prototype.connect;
require('node:net').Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof options === 'object' ? options.host : (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('External network is disabled in the local simulator');
  return connect.apply(this, args);
};
const load = Module._load;
Module._load = function (name, parent, ...args) {
  if (name === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (name.includes('cardcom-token-charge.adapter')) return {
    charge: async () => { throw new Error('Real CardCom is disabled in the local simulator'); },
    reconcile: async () => { throw new Error('Real CardCom is disabled in the local simulator'); },
  };
  return load.call(this, name, parent, ...args);
};
const express = require('express');
const listen = express.application.listen;
express.application.listen = function (port, callback) { return listen.call(this, port, '127.0.0.1', callback); };
const pool = require(path.join(root, 'src/db/db'));
async function start() {
  const identity = (await pool.query('SELECT current_database() AS name')).rows[0];
  if (identity.name !== 'hamonym_fin11_simulator_ui') throw new Error('Unexpected database');
  const role = (await pool.query("INSERT INTO roles(code,name) VALUES('local_simulator_admin','מנהל סימולציה מקומית') ON CONFLICT(lower(code)) DO UPDATE SET name=EXCLUDED.name RETURNING id")).rows[0].id;
  const password = await require('bcrypt').hash('Fin11Local!2026', 10);
  const admin = (await pool.query("INSERT INTO users(role_id,email,password_hash,full_name,is_super_admin,is_active,email_verified) VALUES($1,'admin@hamonym.local',$2,'מנהל סימולציה',true,true,true) ON CONFLICT(lower(email)) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id", [role, password])).rows[0].id;
  let entity = (await pool.query("SELECT id FROM entities WHERE display_name='עמותת סימולציה מקומית'")).rows[0]?.id;
  if (!entity) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      entity = (await client.query("INSERT INTO entities(display_name,created_by_user_id,status) VALUES('עמותת סימולציה מקומית',$1,'active') RETURNING id", [admin])).rows[0].id;
      const campaign = (await client.query("INSERT INTO campaigns(entity_id,slug,title) VALUES($1,'local-fin11-simulation','קמפיין בדיקת גבייה מקומית') RETURNING id", [entity])).rows[0].id;
      await client.query("INSERT INTO billing_accounts(entity_id,fee_rate,vat_rate,preferred_collection_method,enforcement_status) VALUES($1,.03,.18,'card','active')", [entity]);
      await client.query("INSERT INTO entity_billing(entity_id,token,exp_month,exp_year,is_default,status) VALUES($1,'LOCAL_MOCK_ONLY','12','2030',true,'active')", [entity]);
      await client.query("INSERT INTO donations(campaign_id,entity_id,amount,status,is_mock,completed_at) VALUES($1,$2,5100,'paid',false,'2026-10-20T10:00Z')", [campaign, entity]);
      await client.query('INSERT INTO platform_billing_settings(id,vat_rate) VALUES(1,.18) ON CONFLICT(id) DO NOTHING');
      await client.query("INSERT INTO admin_simulation_clock(enabled,fixed_at,updated_by) VALUES(true,'2026-10-28T17:59Z',$1)", [admin]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  // Existing safety configuration is automatic for this dedicated synthetic fixture.
  process.env.FIN11_SIMULATION_ENTITY_IDS = entity;
  require(path.join(root, 'src/server'));
  console.log('Local simulator: isolated database, mock payments only, schedulers disabled.');
}
start().catch(async error => { console.error(error.message); await pool.end(); process.exit(1); });
