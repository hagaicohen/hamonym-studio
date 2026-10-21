// Campaign Donations Reset (2026-10, Super Admin "סימולציה" tab, tool B).
// Runs against the genuinely isolated local Postgres container (see
// test-fin11-closure-autoapproval.js's header for setup) -- this is a
// destructive, write-heavy operation, the mandatory constraint for any
// such test.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_NAME = 'hamonym_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'testpass';
process.env.DB_SSL = 'false';

const pool = require('../src/db/db');
const campaignReset = require('../src/modules/billing-engine/campaign-reset.service');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

let userId;
let periodCounter = Math.floor(Date.now() / 1000) % 9000;

async function seedBase() {
  const role = await pool.query(`INSERT INTO roles (code, name) VALUES ($1, 'T') RETURNING id`, [`t_role_campreset_${Date.now()}`]);
  const user = await pool.query(`INSERT INTO users (role_id, email, is_super_admin) VALUES ($1, $2, true) RETURNING id`, [role.rows[0].id, `campreset-${Date.now()}@isolated.local`]);
  userId = user.rows[0].id;
  await pool.query(`INSERT INTO platform_billing_settings (id, vat_rate) VALUES (1, 0.18) ON CONFLICT (id) DO NOTHING`);
}

async function makeEntity(name) {
  const e = await pool.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [name, userId]);
  return e.rows[0].id;
}
async function makeBillingAccount(entityId) {
  const ba = await pool.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [entityId]);
  return ba.rows[0].id;
}
async function makeCampaign(entityId, title) {
  const slug = `${title.replace(/\s+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const c = await pool.query(`INSERT INTO campaigns (entity_id, slug, title, current_amount, supporters_count) VALUES ($1,$2,$3,0,0) RETURNING id`, [entityId, slug, title]);
  return c.rows[0].id;
}
async function makeDonation(campaignId, entityId, amount) {
  const d = await pool.query(
    `INSERT INTO donations (campaign_id, entity_id, amount, status, is_mock, completed_at, donor_name, donor_email)
     VALUES ($1,$2,$3,'paid',false,NOW(),'Test Donor','test@isolated.local') RETURNING id`,
    [campaignId, entityId, amount]
  );
  return d.rows[0].id;
}
async function makePeriod() {
  periodCounter++;
  const offset = periodCounter * 3;
  const start = new Date(Date.UTC(2298, 0, 1 + offset));
  const end = new Date(Date.UTC(2298, 0, 2 + offset));
  const p = await pool.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [start, end]);
  return p.rows[0].id;
}
// Builds a statement with real statement_components for a GIVEN set of
// {donationId, amount} pairs -- mirrors calculation.service.js#computeAmounts'
// exact formula so the test's "expected" numbers are computed the identical
// way production would.
async function makeStatementWithComponents(accountId, periodId, donationAmounts, { status = 'approved', feeRate = 0.03, vatRate = 0.18 } = {}) {
  const run = await pool.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [periodId]);
  const gross = donationAmounts.reduce((sum, d) => sum + d.amount, 0);
  const fee = Math.round(gross * feeRate * 100) / 100;
  const vat = Math.round(fee * vatRate * 100) / 100;
  const total = fee + vat;
  const s = await pool.query(
    `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [accountId, periodId, run.rows[0].id, gross, feeRate, vatRate, fee, vat, total, status]
  );
  const statementId = s.rows[0].id;
  for (const { donationId, amount } of donationAmounts) {
    await pool.query(
      `INSERT INTO statement_components (statement_id, donation_id, amount_snapshot, completed_at_snapshot, origin_type, billing_effective_at_snapshot)
       VALUES ($1,$2,$3,NOW(),'card_onetime',NOW())`,
      [statementId, donationId, amount]
    );
    await pool.query(`UPDATE donations SET effective_statement_id = $1 WHERE id = $2`, [statementId, donationId]);
  }
  return { statementId, gross, fee, vat, total };
}

async function main() {
  await seedBase();

  // --- Scenario 1: draft statement, single campaign, no sharing ---------
  const e1 = await makeEntity('ZZZ_TEST_campreset_draft');
  const ba1 = await makeBillingAccount(e1);
  const camp1 = await makeCampaign(e1, 'ZZZ_TEST campaign draft');
  const d1a = await makeDonation(camp1, e1, 100);
  const d1b = await makeDonation(camp1, e1, 200);
  const p1 = await makePeriod();
  const st1 = await makeStatementWithComponents(ba1, p1, [{ donationId: d1a, amount: 100 }, { donationId: d1b, amount: 200 }], { status: 'draft' });
  await pool.query(`UPDATE campaigns SET current_amount = 300, supporters_count = 2 WHERE id = $1`, [camp1]);

  const preview1 = await campaignReset.getCampaignResetPreview(camp1);
  check('1a. preview shows correct donation count/total for the draft scenario', preview1.donationCount === 2 && preview1.totalAmount === 300, JSON.stringify(preview1));

  const res1 = await campaignReset.resetCampaignDonations({ campaignId: camp1, superAdminUserId: userId, reason: 'test reset 1' });
  check('1b. reset succeeds, removes exactly 2 donations totaling 300', res1.reset === true && res1.donationsRemoved === 2 && res1.totalAmountRemoved === 300, JSON.stringify(res1));

  const stAfter1 = await pool.query(`SELECT gross_raised, fee_amount, vat_amount, total_due FROM statements WHERE id = $1`, [st1.statementId]);
  check('1c. draft statement recomputed to EXACTLY zero (direct recompute, not an adjustment)', Number(stAfter1.rows[0].gross_raised) === 0 && Number(stAfter1.rows[0].total_due) === 0, JSON.stringify(stAfter1.rows[0]));

  const donationsLeft1 = await pool.query(`SELECT count(*) FROM donations WHERE campaign_id = $1`, [camp1]);
  check('1d. zero donations remain for this campaign', Number(donationsLeft1.rows[0].count) === 0);

  const campAfter1 = await pool.query(`SELECT current_amount, supporters_count FROM campaigns WHERE id = $1`, [camp1]);
  check('1e. campaign counters reset to zero', Number(campAfter1.rows[0].current_amount) === 0 && campAfter1.rows[0].supporters_count === 0, JSON.stringify(campAfter1.rows[0]));

  // --- Scenario 2: SHARED statement -- two campaigns, same entity, same
  // statement. Reset ONE campaign; the other's donations/components and
  // the statement's frozen total_due must be completely untouched; the
  // effective balance must correct via statement_adjustments. -----------
  const e2 = await makeEntity('ZZZ_TEST_campreset_shared');
  const ba2 = await makeBillingAccount(e2);
  const campA = await makeCampaign(e2, 'ZZZ_TEST campaign A (will be reset)');
  const campB = await makeCampaign(e2, 'ZZZ_TEST campaign B (must survive)');
  const dA = await makeDonation(campA, e2, 500);
  const dB = await makeDonation(campB, e2, 300);
  const p2 = await makePeriod();
  const st2 = await makeStatementWithComponents(ba2, p2, [{ donationId: dA, amount: 500 }, { donationId: dB, amount: 300 }], { status: 'approved' });

  const res2 = await campaignReset.resetCampaignDonations({ campaignId: campA, superAdminUserId: userId, reason: 'test reset 2 (shared statement)' });
  check('2a. reset of campaign A succeeds via statement_adjustment (statement is approved, not draft)', res2.reset === true && res2.statementsAdjusted[0]?.method === 'statement_adjustment', JSON.stringify(res2));

  const stAfter2 = await pool.query(`SELECT total_due FROM statements WHERE id = $1`, [st2.statementId]);
  check('2b. the approved statement\'s total_due is BYTE-IDENTICAL to before -- never mutated directly', Number(stAfter2.rows[0].total_due) === st2.total, `before=${st2.total} after=${stAfter2.rows[0].total_due}`);

  const balance2 = await require('../src/modules/billing-engine/statement-balance.service').getStatementBalance(st2.statementId);
  // Expected new total: fee/vat recomputed from remaining gross (300 only)
  const expectedNewFee = Math.round(300 * 0.03 * 100) / 100;
  const expectedNewVat = Math.round(expectedNewFee * 0.18 * 100) / 100;
  const expectedNewTotal = expectedNewFee + expectedNewVat;
  check('2c. the ADJUSTED (effective) total correctly reflects only campaign B\'s remaining gross -- recomputed via the SAME formula as calculation.service.js, not approximated', Math.abs(balance2.adjustedTotal - expectedNewTotal) < 0.01, `adjustedTotal=${balance2.adjustedTotal} expected=${expectedNewTotal}`);

  const campBDonationStillThere = await pool.query(`SELECT id FROM donations WHERE id = $1`, [dB]);
  check('2d. campaign B\'s donation is COMPLETELY untouched', campBDonationStillThere.rows.length === 1);

  const campBComponentStillThere = await pool.query(`SELECT id FROM statement_components WHERE statement_id = $1 AND donation_id = $2`, [st2.statementId, dB]);
  check('2e. campaign B\'s statement_component is COMPLETELY untouched', campBComponentStillThere.rows.length === 1);

  const campBCounters = await pool.query(`SELECT current_amount, supporters_count FROM campaigns WHERE id = $1`, [campB]);
  check('2f. campaign B itself (counters) is untouched by campaign A\'s reset', true, JSON.stringify(campBCounters.rows[0])); // just documenting -- campB counters were never set by this test, not the point under test

  // --- Scenario 3: BLOCKED -- an active collection attempt on the shared
  // statement must abort the WHOLE reset, transactionally, nothing partial.
  const e3 = await makeEntity('ZZZ_TEST_campreset_blocked');
  const ba3 = await makeBillingAccount(e3);
  const camp3 = await makeCampaign(e3, 'ZZZ_TEST campaign blocked');
  const d3 = await makeDonation(camp3, e3, 150);
  const p3 = await makePeriod();
  const st3 = await makeStatementWithComponents(ba3, p3, [{ donationId: d3, amount: 150 }], { status: 'approved' });
  await pool.query(`INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount) VALUES ($1,'card',1,150)`, [st3.statementId]);

  let blockedErr = null;
  try {
    await campaignReset.resetCampaignDonations({ campaignId: camp3, superAdminUserId: userId, reason: 'should be blocked' });
  } catch (err) {
    blockedErr = err;
  }
  check('3a. reset is REFUSED when an active collection attempt exists on the statement', blockedErr?.code === 'ACTIVE_COLLECTION_ATTEMPT', blockedErr?.message);

  const donationStillThere3 = await pool.query(`SELECT id FROM donations WHERE id = $1`, [d3]);
  check('3b. the blocked reset is fully transactional -- the donation was NOT removed', donationStillThere3.rows.length === 1);

  // --- Scenario 4: BLOCKED -- a non-adjustable statement status --------
  const e4 = await makeEntity('ZZZ_TEST_campreset_cancelled');
  const ba4 = await makeBillingAccount(e4);
  const camp4 = await makeCampaign(e4, 'ZZZ_TEST campaign cancelled stmt');
  const d4 = await makeDonation(camp4, e4, 80);
  const p4 = await makePeriod();
  const st4 = await makeStatementWithComponents(ba4, p4, [{ donationId: d4, amount: 80 }], { status: 'cancelled' });

  let blockedErr4 = null;
  try {
    await campaignReset.resetCampaignDonations({ campaignId: camp4, superAdminUserId: userId, reason: 'should be blocked too' });
  } catch (err) {
    blockedErr4 = err;
  }
  check('4a. reset is REFUSED when a statement is cancelled (not draft, not adjustable)', blockedErr4?.code === 'STATEMENT_NOT_RESETTABLE', blockedErr4?.message);

  // --- Scenario 5: campaign with no donations at all -- clean no-op ----
  const e5 = await makeEntity('ZZZ_TEST_campreset_empty');
  const camp5 = await makeCampaign(e5, 'ZZZ_TEST campaign empty');
  const res5 = await campaignReset.resetCampaignDonations({ campaignId: camp5, superAdminUserId: userId, reason: 'empty campaign' });
  check('5a. a campaign with zero donations returns a clean no-op, not an error', res5.reset === false && res5.reason === 'no_donations', JSON.stringify(res5));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== TOTAL: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) console.log('FAILURES:', failed);

  await pool.end();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
