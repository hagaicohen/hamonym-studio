const root = 'C:/DEV/HamonymStudio/hamonym-backend';
require(root + '/node_modules/dotenv').config({path: root + '/.env', quiet: true});
const {Client} = require(root + '/node_modules/pg');
const client = new Client({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
(async () => {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`SELECT id,display_name,registration_number,status,created_at,updated_at,deleted_at,created_by_user_id
    FROM entities WHERE display_name LIKE $1 OR id = $2 ORDER BY created_at`, ['%עורו%', '4f343f7e-0ed5-458d-bcd4-c52679691411']);
  console.log(JSON.stringify(result.rows));
  await client.query('ROLLBACK');
})().catch(error => { console.error(error.code || error.message); process.exitCode=1; }).finally(() => client.end());
