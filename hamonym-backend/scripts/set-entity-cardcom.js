require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const ENTITY_ID = '9fb88307-2999-459e-8d9c-42b53a82051c';

pool.query(
  `UPDATE entities
   SET cardcom_terminal    = $1,
       cardcom_api_name    = $2,
       cardcom_api_password = $3
   WHERE id = $4
   RETURNING display_name, cardcom_terminal`,
  [
    process.env.HAMONYM_CARDCOM_TERMINAL.trim(),
    process.env.HAMONYM_CARDCOM_API_NAME.trim(),
    process.env.HAMONYM_CARDCOM_API_PASSWORD.trim(),
    ENTITY_ID,
  ]
).then(r => {
  console.log('Updated:', r.rows[0]);
  pool.end();
}).catch(err => {
  console.error('Error:', err.message);
  pool.end();
});
