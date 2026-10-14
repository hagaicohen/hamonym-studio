// FIN-11 Stage 2B — pre-deploy fail-fast gate.
// docs/finance/FIN11_STAGE2B_TECHNICAL_DESIGN.md section 7 documents WHY
// this exists: openAttempt and getFin11CappedCardProposal now call
// hasOpenCollectionHold(), which queries payment_exceptions -- a table
// that does not exist until migration 073 is applied. Deploying Stage 2B's
// code before that migration runs breaks openAttempt (the live production
// collection path) with a raw "relation does not exist" error.
//
// This script is the deployment-sequence gate: run migration 073, THEN run
// this script, THEN deploy/restart the app -- never the other order. It
// is read-only (no writes, no DDL) and exits non-zero if anything required
// is missing, so a deploy pipeline can treat it as a hard stop.
//
// Run: node scripts/verify-fin11-stage2b-ready.js
require('dotenv').config();
const pool = require('../src/db/db');

const REQUIRED_TABLES = {
  payment_exceptions: [
    'id', 'statement_id', 'collection_attempt_id', 'payment_id', 'entity_id',
    'outstanding_before', 'collected_amount', 'overpayment_amount', 'detected_at',
    'status', 'hold_new_collection', 'created_at',
  ],
  payment_exception_actions: [
    'id', 'exception_id', 'action_type', 'super_admin_user_id', 'reason', 'evidence_notes', 'created_at',
  ],
};

const REQUIRED_TRIGGERS = [
  { table: 'payment_exceptions', name: 'trg_payment_exceptions_enforce_immutable_facts' },
  { table: 'payment_exception_actions', name: 'trg_payment_exception_actions_no_update' },
  { table: 'payment_exception_actions', name: 'trg_payment_exception_actions_no_delete' },
];

async function main() {
  const problems = [];

  for (const [table, expectedColumns] of Object.entries(REQUIRED_TABLES)) {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [table]
    );
    if (res.rows.length === 0) {
      problems.push(`Table "${table}" does not exist -- migration 073 has not been applied to this database.`);
      continue;
    }
    const actualColumns = new Set(res.rows.map((r) => r.column_name));
    const missing = expectedColumns.filter((c) => !actualColumns.has(c));
    if (missing.length > 0) {
      problems.push(`Table "${table}" exists but is missing column(s): ${missing.join(', ')} -- schema does not match migration 073.`);
    }
  }

  for (const { table, name } of REQUIRED_TRIGGERS) {
    const res = await pool.query(
      `SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = $1 AND t.tgname = $2 AND NOT t.tgisinternal`,
      [table, name]
    );
    if (res.rows.length === 0) {
      problems.push(`Trigger "${name}" on table "${table}" is missing -- the append-only/immutability guarantees are NOT enforced.`);
    }
  }

  if (problems.length > 0) {
    console.error('FIN-11 Stage 2B is NOT ready to deploy. Problems found:');
    for (const p of problems) console.error('  - ' + p);
    console.error('\nFix: apply migration 073 (scripts/migrate-073.js) against THIS database first, then re-run this script.');
    process.exit(1);
  }

  console.log('FIN-11 Stage 2B schema check: OK. payment_exceptions/payment_exception_actions exist with all expected columns and triggers.');
  console.log('Safe to deploy the Stage 2B application code against this database.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification script itself failed (DB connectivity or unexpected error):', err.message);
  process.exit(1);
});
