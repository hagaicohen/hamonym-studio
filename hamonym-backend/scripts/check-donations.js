require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false } });

Promise.all([
  pool.query(`SELECT id, amount, status, provider_reference, completed_at, created_at FROM donations ORDER BY created_at DESC LIMIT 5`),
  pool.query(`SELECT id, slug, current_amount, supporters_count FROM campaigns ORDER BY created_at DESC LIMIT 3`),
]).then(([d, c]) => {
  console.log('\n=== DONATIONS (last 5) ===');
  d.rows.forEach(r => console.log(JSON.stringify(r)));
  console.log('\n=== CAMPAIGNS ===');
  c.rows.forEach(r => console.log(JSON.stringify(r)));
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
