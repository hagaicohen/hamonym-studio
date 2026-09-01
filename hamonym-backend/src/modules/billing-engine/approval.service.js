// Approval Engine (frozen design, 2026-08-28) — the financial commit point
// of Billing. Audited against migration 058 before writing this (see
// scratchpad audit, no schema change was needed): a Statement row lock,
// then a lock+claim of every component donation, then the draft->approved
// UPDATE, all inside one transaction, hit no trigger obstruction — the
// write-once trigger on effective_statement_id allows NULL->value, and the
// immutability trigger only restricts money/linkage fields once status
// leaves 'draft', so the status-flip itself is unrestricted while still
// 'draft'.
//
// Concurrency model: SELECT ... FOR UPDATE locks the Statement row first,
// then every component donation row, ORDER BY donation id (a fixed,
// deterministic order — required so two overlapping approvals requesting
// an overlapping donation set always request their locks in the same
// relative order, which is what actually prevents a deadlock rather than
// merely making one less likely). Validation re-reads donation state AFTER
// acquiring the lock, so the loser of a race sees the winner's already-
// committed claim and fails as a clean business conflict — never a raw
// trigger exception, and never a partial claim, because everything sits
// inside one transaction with no SAVEPOINTs to survive past.
const pool = require('../../db/db');

const EFFECTIVE_STATEMENT_STATUSES = ['approved', 'open', 'paid', 'cancelled', 'written_off'];

class ApprovalError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details || {};
  }
}
function fail(code, message, details) {
  throw new ApprovalError(code, message, details);
}

async function loadStatementForUpdate(client, statementId) {
  const res = await client.query(
    `SELECT s.id, s.status, s.gross_raised, s.billing_account_id, ba.entity_id AS account_entity_id,
            br.mode AS run_mode
     FROM statements s
     JOIN billing_runs br ON br.id = s.billing_run_id
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     WHERE s.id = $1
     FOR UPDATE OF s`,
    [statementId]
  );
  return res.rows[0] || null;
}

async function loadComponentsForUpdate(client, statementId) {
  // ORDER BY d.id — the deterministic lock-ordering deadlock guard
  // described above. Locks the donation rows, not just reads them.
  const res = await client.query(
    `SELECT sc.donation_id, sc.amount_snapshot,
            d.status AS donation_status, d.is_mock, d.amount, d.entity_id, d.effective_statement_id
     FROM statement_components sc
     JOIN donations d ON d.id = sc.donation_id
     WHERE sc.statement_id = $1
     ORDER BY d.id
     FOR UPDATE OF d`,
    [statementId]
  );
  return res.rows;
}

// Structural/business validation against the FROZEN calculation result —
// never recomputes fee/VAT from current billing_accounts config, only
// checks that what was calculated is still internally and externally
// consistent. Throws ApprovalError on the first violation found.
function validateForApproval(statement, components) {
  if (statement.run_mode !== 'production') {
    fail('NOT_PRODUCTION_RUN', `statement ${statement.id} does not belong to a production billing run`);
  }
  if (components.length === 0) {
    fail('NO_COMPONENTS', `statement ${statement.id} has no components`);
  }

  let sumSnapshots = 0;
  for (const c of components) {
    if (c.donation_status !== 'paid') {
      fail('DONATION_NOT_PAID', `donation ${c.donation_id} is not paid`, { donationId: c.donation_id });
    }
    if (c.is_mock) {
      fail('DONATION_IS_MOCK', `donation ${c.donation_id} is a mock donation`, { donationId: c.donation_id });
    }
    if (String(c.amount) !== String(c.amount_snapshot)) {
      fail('AMOUNT_DRIFT', `donation ${c.donation_id} amount no longer matches its frozen snapshot`, {
        donationId: c.donation_id, currentAmount: c.amount, snapshotAmount: c.amount_snapshot,
      });
    }
    if (c.entity_id !== statement.account_entity_id) {
      fail('ENTITY_MISMATCH', `donation ${c.donation_id} entity no longer matches the billing account's entity`, {
        donationId: c.donation_id,
      });
    }
    if (c.effective_statement_id !== null && c.effective_statement_id !== statement.id) {
      fail('DONATION_ALREADY_CLAIMED_BY_OTHER_STATEMENT', `donation ${c.donation_id} is already claimed by a different statement`, {
        donationId: c.donation_id, claimedBy: c.effective_statement_id,
      });
    }
    sumSnapshots += Number(c.amount_snapshot);
  }

  // Compared as strings at 2-decimal precision, not float equality —
  // amount_snapshot values are already exact 2-decimal NUMERICs, so a plain
  // decimal-string sum built up in JS only from already-2-decimal inputs
  // and compared against another already-2-decimal string is safe here;
  // no rounding step is involved (unlike fee/VAT calculation, which stays
  // entirely in SQL for exactly that reason).
  const sumStr = sumSnapshots.toFixed(2);
  if (sumStr !== String(statement.gross_raised)) {
    fail('GROSS_RAISED_MISMATCH', `statement ${statement.id} gross_raised does not match SUM(component snapshots)`, {
      grossRaised: statement.gross_raised, sumSnapshots: sumStr,
    });
  }
}

// Returns true if every component donation is already correctly claimed by
// this exact statement — the condition under which re-approving a
// non-draft statement is a safe no-op rather than an integrity failure.
function isSelfConsistentlyClaimed(components, statementId) {
  return components.every((c) => c.effective_statement_id === statementId);
}

async function approveStatement(statementId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const statement = await loadStatementForUpdate(client, statementId);
    if (!statement) fail('STATEMENT_NOT_FOUND', `statement ${statementId} not found`);

    if (statement.status === 'abandoned') {
      fail('CANNOT_APPROVE_ABANDONED', `statement ${statementId} is abandoned and terminal`);
    }

    if (statement.status !== 'draft') {
      // Already approved (or further downstream) — idempotent only if the
      // committed state is genuinely self-consistent; otherwise this is a
      // real integrity problem and must be surfaced, not silently accepted.
      const components = await loadComponentsForUpdate(client, statementId);
      if (!isSelfConsistentlyClaimed(components, statementId)) {
        fail('APPROVAL_INTEGRITY_VIOLATION', `statement ${statementId} is ${statement.status} but its components are not all claimed by it`, {
          currentStatus: statement.status,
        });
      }
      await client.query('COMMIT');
      return { approved: true, statementId, alreadyApproved: true, status: statement.status };
    }

    const components = await loadComponentsForUpdate(client, statementId);
    validateForApproval(statement, components);

    for (const c of components) {
      // Unconditional UPDATE — the write-once trigger is what actually
      // enforces "only if not already claimed by someone else"; the
      // validation pass above already checked the pre-lock state, but the
      // trigger is the real guard against anything that slipped through
      // (there should be nothing, given the FOR UPDATE lock ordering, but
      // this is not relied upon as the only check for exactly that reason).
      await client.query(`UPDATE donations SET effective_statement_id = $1 WHERE id = $2`, [statementId, c.donation_id]);
    }

    await client.query(`UPDATE statements SET status = 'approved' WHERE id = $1`, [statementId]);

    await client.query('COMMIT');
    return { approved: true, statementId, donationsClaimed: components.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof ApprovalError) throw err;
    throw new ApprovalError('APPROVAL_FAILED', err.message, { cause: err.message });
  } finally {
    client.release();
  }
}

async function abandonStatement(statementId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(`SELECT id, status FROM statements WHERE id = $1 FOR UPDATE`, [statementId]);
    const statement = res.rows[0];
    if (!statement) fail('STATEMENT_NOT_FOUND', `statement ${statementId} not found`);

    if (statement.status === 'abandoned') {
      await client.query('COMMIT');
      return { abandoned: true, statementId, alreadyAbandoned: true };
    }
    if (statement.status !== 'draft') {
      fail('CANNOT_ABANDON_EFFECTIVE_STATEMENT', `statement ${statementId} is ${statement.status}, not draft — cannot be abandoned`, {
        currentStatus: statement.status,
      });
    }

    await client.query(`UPDATE statements SET status = 'abandoned' WHERE id = $1`, [statementId]);
    await client.query('COMMIT');
    return { abandoned: true, statementId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof ApprovalError) throw err;
    throw new ApprovalError('ABANDON_FAILED', err.message, { cause: err.message });
  } finally {
    client.release();
  }
}

module.exports = { approveStatement, abandonStatement, ApprovalError, EFFECTIVE_STATEMENT_STATUSES };
