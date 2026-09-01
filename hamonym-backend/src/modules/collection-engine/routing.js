// Collection method routing (Billing v1, 2026-09-01) --
// docs/HAMONYM_BILLING_ENGINE_SPEC.md's routing table (§"חיוב חודשי") +
// this task's Bundle 2 correction on MASAV authorization. This is the one
// place that decides how an approved Statement actually gets collected --
// collection.service.js#openAttempt is the only caller that acts on it;
// billing-ops' read-only listing queries duplicate the same threshold for
// display only (see their own comments), never the authoritative decision.
//
// billing_accounts.preferred_collection_method is deliberately NOT read
// here. Per the explicit correction in this task's brief, that column stays
// the entity's declared default/capability seed from provisioning time --
// it is no longer the per-Statement routing decision.
const CARD_MASAV_THRESHOLD = 3540; // ILS gross statement total, see spec doc's routing table.

// client must be inside the same transaction/lock scope as the caller
// (collection.service.js holds the Statement row lock across this call).
// Returns one of:
//   { method: 'card' }
//   { method: 'masav' }
//   { method: null, blocked: true, reason: 'masav_not_configured' | 'masav_not_authorized' | 'masav_incomplete' }
// Never falls back silently from a blocked masav routing to card -- a
// Statement above the threshold either routes to masav or is blocked, full
// stop (per the brief: "Never silently fall back to CardCom").
async function resolveCollectionMethod(client, statement) {
  const totalDue = Number(statement.total_due);
  if (totalDue <= CARD_MASAV_THRESHOLD) {
    return { method: 'card' };
  }

  const res = await client.query(
    `SELECT authorized, bank_code, branch_code, account_number
     FROM entity_masav_details WHERE entity_id = $1`,
    [statement.entity_id]
  );
  const config = res.rows[0];
  if (!config) {
    return { method: null, blocked: true, reason: 'masav_not_configured' };
  }
  if (!config.bank_code || !config.branch_code || !config.account_number) {
    return { method: null, blocked: true, reason: 'masav_incomplete' };
  }
  if (!config.authorized) {
    return { method: null, blocked: true, reason: 'masav_not_authorized' };
  }
  return { method: 'masav' };
}

module.exports = { CARD_MASAV_THRESHOLD, resolveCollectionMethod };
