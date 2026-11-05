// Metadata only: never runs migrations or touches financial records.
const pool = require('../../db/db');
async function ready(db = pool) {
  const row = (await db.query(`SELECT to_regclass('public.admin_simulation_clock') IS NOT NULL
    AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='collection_attempts' AND column_name='business_collection_at') AS ready`)).rows[0];
  return row?.ready === true;
}
module.exports = { ready };
