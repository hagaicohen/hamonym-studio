require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

pool.query(`
  ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS current_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS supporters_count INT           NOT NULL DEFAULT 0;
`).then(() => {
  console.log('campaigns columns OK');
  return pool.query(`
    ALTER TABLE donations
      ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_anonymous       BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS ambassador_id      UUID,
      ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(100);
  `);
}).then(() => {
  console.log('donations columns OK');
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
