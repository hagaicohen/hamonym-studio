require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/025_registration_participant_shirt_size.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migration 025 applied.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
