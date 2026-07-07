require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_ambassadors (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id      UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      full_name        TEXT        NOT NULL,
      phone            TEXT,
      email            TEXT,
      goal_amount      NUMERIC(12,2),
      status           TEXT        NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','inactive','pending')),
      personal_message TEXT        NOT NULL DEFAULT '',
      slug             TEXT        NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id          UUID,
      CONSTRAINT campaign_ambassadors_unique_slug UNIQUE (campaign_id, slug)
    );
  `);
  console.log('campaign_ambassadors OK');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ambassador_adjustments (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      ambassador_id  UUID        NOT NULL REFERENCES campaign_ambassadors(id) ON DELETE CASCADE,
      amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      reason         TEXT        NOT NULL DEFAULT '',
      created_by     UUID,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('ambassador_adjustments OK');

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_camp_amb_campaign    ON campaign_ambassadors(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_camp_amb_slug        ON campaign_ambassadors(campaign_id, slug);
    CREATE INDEX IF NOT EXISTS idx_amb_adj_ambassador   ON ambassador_adjustments(ambassador_id);
    CREATE INDEX IF NOT EXISTS idx_donations_ambassador ON donations(ambassador_id);
  `);
  console.log('indexes OK');

  pool.end();
  console.log('Migration 005 complete.');
}

run().catch(e => { console.error(e.message); pool.end(); });
