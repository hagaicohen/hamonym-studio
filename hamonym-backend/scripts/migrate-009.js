require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/009_oauth_users.sql'), 'utf8');
  await pool.query(sql);
  console.log('password_hash nullable: OK');
  console.log('picture column: OK');
  pool.end();
  console.log('Migration 009 complete.');
}

run().catch(e => { console.error(e.message); pool.end(); });
