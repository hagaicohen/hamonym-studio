require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/026_registration_options.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migration 026 applied.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
