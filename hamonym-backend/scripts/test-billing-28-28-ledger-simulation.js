// Non-financial two-cycle ledger simulation for the 28->28 cutoff
// restoration (2026-09-18). Proves the exactly-once invariant with real
// numbers, using the REAL production eligibility query
// (calculation.service.js#calculateAccountStatement) against real rows --
// but the entire script runs inside ONE transaction that is explicitly
// ROLLED BACK at the end and never committed, so nothing here is a real
// financial event and nothing persists: donations.status='paid' rows are
// normally permanently undeletable once committed (trg_donations_block_
// paid_delete), which is exactly why this is a rollback-only simulation
// rather than a live-fixture script with a cleanup step -- there is no
// commit to clean up after. This is deliberately NOT another permanent
// Donation->Billing E2E chain.
//
// Mirrors the exact timestamp scenario from the design conversation
// (28 Aug / 28 Sep / 28 Oct cutoffs), shifted to 2094 so it can never
// collide with real production billing_periods -- verified free via grep
// across every other script's own reserved windows before this shipped.
//
// Run: node scripts/test-billing-28-28-ledger-simulation.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const calculation = require('../src/modules/billing-engine/calculation.service');
const { computeIsraeliCutoffUtcInstant } = require('../src/modules/billing-engine/billing-period.util');

let failures = 0;
let passed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const AMOUNT = 100;
const FIXTURE_TAG = `ZZZ_TEST_DATA_DO_NOT_USE_28-28-ledger-sim-${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17;

async function main() {
  const client = await pool.connect();
  let statementAId = null;
  let statementBId = null;
  try {
    await client.query('BEGIN');

    const augCutoff = await computeIsraeliCutoffUtcInstant(client, 2094, 8); // 2094-08-28T17:00:00Z
    const sepCutoff = await computeIsraeliCutoffUtcInstant(client, 2094, 9); // 2094-09-28T17:00:00Z
    const octCutoff = await computeIsraeliCutoffUtcInstant(client, 2094, 10); // 2094-10-28T17:00:00Z

    // ---- fixture scaffolding (entity/account/3 periods/3 runs/1 "earlier" statement) ----
    const entity = await client.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, $2, 'active', 'association') RETURNING id`,
      [FIXTURE_TAG, SUPER_ADMIN_USER_ID]
    );
    const entityId = entity.rows[0].id;

    const account = await client.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate) VALUES ($1, 0.03, 0.18) RETURNING id`,
      [entityId]
    );
    const accountFull = { id: account.rows[0].id, entity_id: entityId, fee_rate: 0.03 };

    const campaign = await client.query(
      `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
      [entityId, `zzz-test-28-28-ledger-sim-${Date.now()}`, FIXTURE_TAG]
    );
    const campaignId = campaign.rows[0].id;

    // "Earlier" cycle: [28 Jul 20:00 Israel, 28 Aug 20:00 Israel) -- only
    // needs to exist as a valid FK target for the one donation that
    // simulates "already claimed by an earlier real run".
    const julCutoff = await computeIsraeliCutoffUtcInstant(client, 2094, 7);
    const periodEarlier = await client.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [julCutoff.toISOString(), augCutoff.toISOString()]
    );
    const runEarlier = await client.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [periodEarlier.rows[0].id, augCutoff.toISOString()]
    );
    const statementEarlier = await client.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, 100, 0.03, 0.18, 3, 0.54, 3.54, 'approved') RETURNING id`,
      [accountFull.id, runEarlier.rows[0].id]
    );
    const statementEarlierId = statementEarlier.rows[0].id;

    // Cycle A: [28 Aug 20:00 Israel, 28 Sep 20:00 Israel)
    const periodA = await client.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [augCutoff.toISOString(), sepCutoff.toISOString()]
    );
    const periodAId = periodA.rows[0].id;
    const runA = await client.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [periodAId, sepCutoff.toISOString()]
    );
    const runAId = runA.rows[0].id;

    // Cycle B: [28 Sep 20:00 Israel, 28 Oct 20:00 Israel)
    const periodB = await client.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [sepCutoff.toISOString(), octCutoff.toISOString()]
    );
    const periodBId = periodB.rows[0].id;
    const runB = await client.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [periodBId, octCutoff.toISOString()]
    );
    const runBId = runB.rows[0].id;

    // ---- the 12 boundary events (A-L from the design conversation), ₪100 each ----
    const events = {
      A: new Date(augCutoff.getTime() - 60_000),      // 28 Aug 19:59 -> EARLIER cycle
      B: new Date(augCutoff.getTime()),                // 28 Aug 20:00 exactly -> RUN A (half-open start)
      C: new Date(augCutoff.getTime() + 60_000),       // 28 Aug 20:01 -> RUN A
      D: new Date(sepCutoff.getTime() - 10 * 60_000),  // 31 Aug-equivalent, late in cycle A -> RUN A
      E: new Date(augCutoff.getTime() + 3 * 3600_000), // 1 Sep-equivalent, early in cycle A -> RUN A
      F: new Date(sepCutoff.getTime() - 60_000),       // 28 Sep 19:59 -> RUN A (last moment before its own cutoff)
      G: new Date(sepCutoff.getTime()),                // 28 Sep 20:00 exactly -> RUN B (half-open start)
      H: new Date(sepCutoff.getTime() + 60_000),       // 28 Sep 20:01 -> RUN B
      I: new Date(octCutoff.getTime() - 10 * 60_000),  // 30 Sep-equivalent, late in cycle B -> RUN B
      J: new Date(sepCutoff.getTime() + 3 * 3600_000), // 1 Oct-equivalent, early in cycle B -> RUN B
      K: new Date(octCutoff.getTime() - 60_000),       // 28 Oct 19:59 -> RUN B (last moment before its own cutoff)
      L: new Date(octCutoff.getTime()),                // 28 Oct 20:00 exactly -> WAITING for the next (unrun) cycle
    };

    const donationIds = {};
    for (const [label, ts] of Object.entries(events)) {
      const res = await client.query(
        `INSERT INTO donations (
           campaign_id, entity_id, amount, donor_name, is_anonymous, rewards,
           status, is_mock, completed_at
         ) VALUES ($1, $2, $3, $4, false, '[]', 'paid', false, $5)
         RETURNING id`,
        [campaignId, entityId, AMOUNT, `${FIXTURE_TAG}-${label}`, ts.toISOString()]
      );
      donationIds[label] = res.rows[0].id;
    }

    // Simulate "A already claimed by an earlier real run" -- directly
    // setting the write-once claim column to a valid, real (if fixture)
    // Statement, exactly what approval.service.js#approveStatement would
    // have done for real weeks earlier. Not re-testing approval itself
    // here (that has its own dedicated suite) -- only that an
    // already-claimed donation is correctly excluded from both A and B.
    await client.query(`UPDATE donations SET effective_statement_id = $1 WHERE id = $2`, [statementEarlierId, donationIds.A]);

    await check('donation A (28 Aug 19:59, already claimed) is excluded from cycle A eligibility', async () => {
      const outcomeA = await calculation.calculateAccountStatement(client, accountFull, {
        billingRunId: runAId, periodStart: augCutoff, periodEnd: sepCutoff,
      });
      assert.strictEqual(outcomeA.zeroActivity, false);
      assert.strictEqual(outcomeA.donationCount, 5, 'must be exactly B,C,D,E,F -- not A');
      assert.strictEqual(String(outcomeA.grossRaised), '500.00');

      const comps = await client.query(
        `SELECT donation_id FROM statement_components WHERE statement_id = $1`,
        [outcomeA.statementId]
      );
      const claimedIds = new Set(comps.rows.map((r) => r.donation_id));
      assert.ok(!claimedIds.has(donationIds.A), 'A must NOT be in cycle A');
      for (const label of ['B', 'C', 'D', 'E', 'F']) {
        assert.ok(claimedIds.has(donationIds[label]), `${label} must be in cycle A`);
      }
      statementAId = outcomeA.statementId;
    });

    await check('cycle B eligibility: exactly G,H,I,J,K -- none of A-F, none of L', async () => {
      const outcomeB = await calculation.calculateAccountStatement(client, accountFull, {
        billingRunId: runBId, periodStart: sepCutoff, periodEnd: octCutoff,
      });
      assert.strictEqual(outcomeB.zeroActivity, false);
      assert.strictEqual(outcomeB.donationCount, 5, 'must be exactly G,H,I,J,K');
      assert.strictEqual(String(outcomeB.grossRaised), '500.00');

      const comps = await client.query(
        `SELECT donation_id FROM statement_components WHERE statement_id = $1`,
        [outcomeB.statementId]
      );
      const claimedIds = new Set(comps.rows.map((r) => r.donation_id));
      for (const label of ['G', 'H', 'I', 'J', 'K']) {
        assert.ok(claimedIds.has(donationIds[label]), `${label} must be in cycle B`);
      }
      for (const label of ['A', 'B', 'C', 'D', 'E', 'F', 'L']) {
        assert.ok(!claimedIds.has(donationIds[label]), `${label} must NOT be in cycle B`);
      }
      statementBId = outcomeB.statementId;
    });

    await check('L (28 Oct 20:00 exactly, start of the NEXT cycle) is claimed by neither A nor B -- still legitimately waiting', async () => {
      const donation = await client.query(`SELECT effective_statement_id FROM donations WHERE id = $1`, [donationIds.L]);
      assert.strictEqual(donation.rows[0].effective_statement_id, null);
      const inA = await client.query(`SELECT 1 FROM statement_components WHERE statement_id = $1 AND donation_id = $2`, [statementAId, donationIds.L]);
      const inB = await client.query(`SELECT 1 FROM statement_components WHERE statement_id = $1 AND donation_id = $2`, [statementBId, donationIds.L]);
      assert.strictEqual(inA.rows.length, 0);
      assert.strictEqual(inB.rows.length, 0);
    });

    await check('the real exactly-once guard lives in the CALLER, not calculateAccountStatement itself: without it, a second calculation on the SAME period would double-list B-F (confirms why PERIOD_ALREADY_CALCULATED exists)', async () => {
      // Eligibility is `effective_statement_id IS NULL` -- and that column
      // is only ever written by approval.service.js#approveStatement,
      // never by calculation. Since this simulation deliberately never
      // approves cycle A's statement (per the task's own scope), B-F are
      // STILL unclaimed at the donations-table level, so a second raw
      // calculateAccountStatement call for the same period finds them
      // again and creates a SECOND draft Statement -- exactly the
      // documented risk calculation.service.js's own header comment
      // warns about. This is not a gap in THIS restoration: the real
      // callers (billing-ops.service.js#calculatePeriod, billing-monthly-
      // cycle.job.js) already refuse a second calculation once any
      // billing_run exists for a period (PERIOD_ALREADY_CALCULATED,
      // covered by its own dedicated tests) -- calculateAccountStatement
      // is intentionally a pure calculation primitive with no policy
      // layer of its own, unaffected by this restoration.
      const secondRunA = await client.query(
        `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
         VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
        [periodAId, sepCutoff.toISOString()]
      );
      const outcome = await calculation.calculateAccountStatement(client, accountFull, {
        billingRunId: secondRunA.rows[0].id, periodStart: augCutoff, periodEnd: sepCutoff,
      });
      assert.strictEqual(outcome.zeroActivity, false, 'B-F are still unclaimed at the donations level (never approved) -- a second raw call finds them again');
      assert.strictEqual(outcome.donationCount, 5);
      // Deliberately not cleaned up here -- statement_components is
      // unconditionally append-only (no DELETE, ever, even pre-commit;
      // this is exactly Invariant #8 in the frozen domain model), so this
      // extra duplicate statement simply coexists harmlessly for the rest
      // of the simulation. The ledger proof below only ever checks
      // membership against `statementAId` specifically, never "any
      // statement", so this duplicate cannot affect it. Everything
      // vanishes together at the final ROLLBACK regardless.
    });

    // ---- ledger printout + the core exactly-once proof ----
    const gross = (n) => `₪${(n * AMOUNT).toFixed(2)}`;
    console.log('\n---- LEDGER ----');
    console.log(`EARLIER RUN:            events = { A }                gross = ${gross(1)}`);
    console.log(`RUN A (cycle ending Sep 28): events = { B,C,D,E,F }        gross = ${gross(5)}`);
    console.log(`RUN B (cycle ending Oct 28): events = { G,H,I,J,K }        gross = ${gross(5)}`);
    console.log(`WAITING FOR NEXT RUN:   events = { L }                gross = ${gross(1)}`);
    console.log(`TOTAL:                  12 events = 1 + 5 + 5 + 1     gross = ${gross(12)}\n`);

    await check('LEDGER PROOF: total events = earlier + RUN A + RUN B + waiting, no event in two buckets', async () => {
      const buckets = {
        earlier: ['A'],
        runA: ['B', 'C', 'D', 'E', 'F'],
        runB: ['G', 'H', 'I', 'J', 'K'],
        waiting: ['L'],
      };
      const allLabels = Object.values(buckets).flat();
      assert.strictEqual(allLabels.length, 12, 'total simulated events must be 12');
      assert.strictEqual(new Set(allLabels).size, 12, 'no label may appear in more than one bucket');
      assert.deepStrictEqual(allLabels.sort(), Object.keys(events).sort(), 'buckets together must cover exactly A-L, nothing more, nothing less');

      // Independently re-derive bucket membership from the REAL DB state
      // (not just the hand-built `buckets` map above) -- the actual proof.
      // Membership is via statement_components, not donations.
      // effective_statement_id -- that column is only ever written at
      // Approval (deliberately never invoked in this simulation, per
      // scope), so both real Statements created above stay legitimately
      // 'draft' with every component donation still formally unclaimed at
      // the donations-table level; "earlier"/"waiting" are told apart by
      // whether a real prior claim (statementEarlierId, standing in for an
      // already-approved historical Statement) exists at all.
      const donationRows = await client.query(
        `SELECT d.id, l.label, d.effective_statement_id,
                EXISTS(SELECT 1 FROM statement_components sc WHERE sc.statement_id = $1 AND sc.donation_id = d.id) AS in_run_a,
                EXISTS(SELECT 1 FROM statement_components sc WHERE sc.statement_id = $2 AND sc.donation_id = d.id) AS in_run_b
         FROM donations d
         JOIN (VALUES ${Object.keys(donationIds).map((l, i) => `($${i * 2 + 3}::uuid, $${i * 2 + 4}::text)`).join(',')}) AS l(donation_id, label)
           ON l.donation_id = d.id`,
        [statementAId, statementBId, ...Object.entries(donationIds).flatMap(([label, id]) => [id, label])]
      );
      let earlierCount = 0, runACount = 0, runBCount = 0, waitingCount = 0;
      for (const row of donationRows.rows) {
        if (row.in_run_a) runACount++;
        else if (row.in_run_b) runBCount++;
        else if (row.effective_statement_id === statementEarlierId) earlierCount++;
        else if (row.effective_statement_id === null) waitingCount++;
        else assert.fail(`donation ${row.label} claimed by an unexpected statement`);
      }
      assert.strictEqual(earlierCount, 1);
      assert.strictEqual(runACount, 5);
      assert.strictEqual(runBCount, 5);
      assert.strictEqual(waitingCount, 1);
      assert.strictEqual(earlierCount + runACount + runBCount + waitingCount, 12, 'the four buckets must exactly partition all 12 events');
    });
  } finally {
    // Never committed -- this whole simulation, including every entity/
    // account/period/run/statement/donation row it created, vanishes as
    // if it never happened. No cleanup queries needed or possible.
    await client.query('ROLLBACK');
    client.release();
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
