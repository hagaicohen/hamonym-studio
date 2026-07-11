const { Pool } = require("pg");

// max: 10 — keep this modest, Supabase's pooler caps total concurrent
// connections; one-off scripts (node -e ...) each open their own Pool and
// should call pool.end() before exiting rather than process.exit()
// immediately, or leaked connections can starve this pool.

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  ssl: { rejectUnauthorized: false },

  max: 10,
  // Generous idle timeout — establishing a *new* connection to this
  // (remote, ap-northeast-2) pooler routinely takes multiple seconds, so a
  // short idle timeout meant reconnecting mid-way through everyday gaps
  // between requests (e.g. someone reading a page for 30+s before their
  // next click). Keeping connections open longer avoids paying that cost
  // on an otherwise-ordinary request.
  idleTimeoutMillis: 300000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Swallow connection-reset errors on idle clients — pool reconnects on next use
pool.on('error', (err) => {
  if (!['ECONNRESET', 'ECONNREFUSED', 'EPIPE'].includes(err.code)) {
    console.error('pg pool error:', err.message);
  }
});

// Nodemon restarts the whole pool on every backend file save during dev —
// without this, whichever real request happens to land first after a
// restart (often a login) eats the multi-second cost of establishing that
// first connection. Firing it here means the server pays that cost once,
// at startup, instead of a user paying it on the next click.
pool.query('SELECT 1').catch((err) => {
  console.error('DB warm-up query failed:', err.message);
});

module.exports = pool;
