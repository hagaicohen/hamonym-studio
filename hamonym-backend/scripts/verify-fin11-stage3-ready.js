// FIN-11 Stage 3 — pre-deploy fail-fast gate, same pattern as
// scripts/verify-fin11-stage2b-ready.js (Stage 2B). masav-proposal.service.js
// depends at runtime on migration 074's table. Read-only, no writes, no DDL.
//
// Run: node scripts/verify-fin11-stage3-ready.js
require('dotenv').config();
const pool = require('../src/db/db');

const REQUIRED_COLUMNS = [
  'id', 'statement_id', 'entity_id', 'proposed_amount', 'outstanding_at_proposal',
  'created_at', 'status', 'status_reason', 'approved_at', 'approved_by_user_id',
  'exported_at', 'exported_by_user_id',
];

async function main() {
  const problems = [];

  const colRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'masav_collection_proposals'`);
  if (colRes.rows.length === 0) {
    problems.push('Table "masav_collection_proposals" does not exist -- migration 074 has not been applied to this database.');
  } else {
    const actual = new Set(colRes.rows.map((r) => r.column_name));
    const missing = REQUIRED_COLUMNS.filter((c) => !actual.has(c));
    if (missing.length > 0) problems.push(`Table "masav_collection_proposals" exists but is missing column(s): ${missing.join(', ')}`);
  }

  const idxRes = await pool.query(`SELECT 1 FROM pg_indexes WHERE tablename = 'masav_collection_proposals' AND indexname = 'idx_masav_proposals_active_per_statement'`);
  if (idxRes.rows.length === 0) problems.push('Unique index "idx_masav_proposals_active_per_statement" is missing -- duplicate-proposal prevention is NOT enforced.');

  const trgRes = await pool.query(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = 'masav_collection_proposals' AND t.tgname = 'trg_masav_proposals_enforce_immutable_facts' AND NOT t.tgisinternal`);
  if (trgRes.rows.length === 0) problems.push('Trigger "trg_masav_proposals_enforce_immutable_facts" is missing -- frozen-fact immutability is NOT enforced.');

  // Also re-verify Stage 2B's own gate, since masav-proposal.service.js
  // calls hasOpenCollectionHold -- a Stage 3 deploy with Stage 2B not yet
  // migrated would ALSO break, same failure mode as Stage 2B's own gate.
  const peRes = await pool.query(`SELECT to_regclass('payment_exceptions') AS t`);
  if (!peRes.rows[0].t) problems.push('Table "payment_exceptions" (Stage 2B, migration 073) does not exist -- Stage 3 depends on it too (hasOpenCollectionHold).');

  if (problems.length > 0) {
    console.error('FIN-11 Stage 3 is NOT ready to deploy. Problems found:');
    for (const p of problems) console.error('  - ' + p);
    console.error('\nFix: apply migrations 073 and 074 (in that order) against THIS database first, then re-run this script.');
    process.exit(1);
  }

  console.log('FIN-11 Stage 3 schema check: OK. masav_collection_proposals exists with all expected columns, index, and trigger. Stage 2B dependency (payment_exceptions) present.');
  console.log('Safe to deploy the Stage 3 application code against this database.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification script itself failed (DB connectivity or unexpected error):', err.message);
  process.exit(1);
});
