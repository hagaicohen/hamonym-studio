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
  idleTimeoutMillis: 30000,
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

module.exports = pool;
