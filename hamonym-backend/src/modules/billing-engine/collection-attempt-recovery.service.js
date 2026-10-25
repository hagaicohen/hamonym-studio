// Shared pilot recovery; time source does not change reconciliation.
const pool = require('../../db/db');
const scope = require('../../lib/fin11-simulation-context');
const { resolveAttempt } = require('../collection-engine/collection.service');
const mock = require('../collection-engine/adapters/fin11-mock.adapter');
async function recover() {
  const config = scope.current();
  if (!scope.current()) throw new Error('Simulation scope required');
  const rows = (await pool.query(
    `SELECT ca.id,ca.statement_id,ba.entity_id FROM collection_attempts ca
     JOIN statements s ON s.id=ca.statement_id JOIN billing_accounts ba ON ba.id=s.billing_account_id
     JOIN billing_runs br ON br.id=s.billing_run_id
     WHERE ca.provider='fin11_mock' AND ca.status IN ('pending','ambiguous') AND s.status IN ('approved','open')
       AND ba.entity_id=ANY($1::uuid[]) AND br.result_summary->>'simulation_provider'='fin11_mock'
       AND br.result_summary->>'simulation_identity'=$2 ORDER BY ca.created_at`, [config.entityIds, config.fingerprint])).rows;
  for (const row of rows) {
    scope.assertEntity(row.entity_id);
    const result = await mock.reconcile({ attemptId: row.id, entityId: row.entity_id });
    await resolveAttempt(row.id, row.statement_id, result);
  }
  return { recovered: rows.length };
}
module.exports = { recover };
