// Collection Ops -- the unified "ניהול גבייה" page's new aggregation layer.
//
// DB-safety note (2026-10, explicit product-owner requirement): this module
// is PURE READ -- it never INSERTs/UPDATEs/DELETEs anything (see its own
// header comment). That means every test below can safely run against the
// real database with zero risk of leaving test residue, unlike every other
// FIN-11 test file in this codebase (which creates and cleans up real
// fixtures). No isolated test database is configured for this project, so
// per the standing instruction ("tests that write financial data must run
// only against an isolated test database; if none is available, do not run
// them against production"), this file deliberately asserts STRUCTURAL
// invariants against whatever real data already exists, rather than
// creating any fixture of its own.
//
// Run: node scripts/test-collection-ops.js
require('dotenv').config();
const pool = require('../src/db/db');
const XLSX = require('xlsx');
const svc = require('../src/modules/platform/collection-ops/collection-ops.service');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

async function main() {
  // --- A. getFinancialOverview -- reconciliation identity must hold for
  // EVERY real period in the database, not just one hand-picked example. ---
  const periods = await pool.query(`SELECT id FROM billing_periods ORDER BY period_start DESC LIMIT 50`);
  check('0. at least one real billing_period exists to test against', periods.rows.length > 0, `found ${periods.rows.length}`);

  let allReconcile = true;
  let checkedCount = 0;
  for (const { id: periodId } of periods.rows) {
    const o = await svc.getFinancialOverview({ periodId });
    const sum = o.paidConfirmed + o.inProcess + o.openBalance;
    const diff = Math.abs(sum - o.totalBilled);
    if (diff >= 0.01) {
      allReconcile = false;
      console.log(`   mismatch for period ${periodId}: paid(${o.paidConfirmed})+inProcess(${o.inProcess})+open(${o.openBalance})=${sum} != totalBilled(${o.totalBilled})`);
    }
    if (o.statementCount > 0) checkedCount++;
  }
  check(`1. paidConfirmed + inProcess + openBalance == totalBilled, exactly, across ${periods.rows.length} real periods (${checkedCount} with statements)`, allReconcile);

  const missingPeriod = await svc.getFinancialOverview({ periodId: '00000000-0000-0000-0000-000000000000' }).catch((e) => e);
  check('1a. a nonexistent periodId fails closed with PERIOD_NOT_FOUND, never a fabricated zero-overview', missingPeriod?.code === 'PERIOD_NOT_FOUND', missingPeriod?.code);

  // --- B. getNeedsAttention -- shape + count/items consistency ---
  const attn = await svc.getNeedsAttention();
  check('2. getNeedsAttention returns exactly the 4 approved categories, in order', JSON.stringify(attn.categories.map((c) => c.category)) === JSON.stringify(['masav_proposal_awaiting_approval', 'open_overpayment_exception', 'card_attempts_exhausted', 'masav_blocked']));
  const countsMatch = attn.categories.every((c) => c.count === c.items.length);
  check('2a. every category\'s count matches its items array length', countsMatch, JSON.stringify(attn.categories.map((c) => ({ cat: c.category, count: c.count, items: c.items.length }))));
  const amountsNonNegative = attn.categories.every((c) => c.totalAmount >= 0);
  check('2b. every category\'s totalAmount is non-negative', amountsNonNegative);
  check('2c. totalCount is the sum of all category counts', attn.totalCount === attn.categories.reduce((s, c) => s + c.count, 0));

  // --- C. getSystemActivity -- the exact set of jobs this page is allowed to show ---
  const activity = await svc.getSystemActivity();
  const automaticNames = activity.automatic.map((j) => j.name);
  check('3. exactly the 2 approved automatic jobs are shown (billing-monthly-cycle, collection-attempt-reconciliation)', JSON.stringify(automaticNames) === JSON.stringify(['billing-monthly-cycle', 'collection-attempt-reconciliation']));
  check('3a. the two frozen legacy jobs never appear anywhere in this output', !JSON.stringify(activity).includes('billing-approval-consistency') && !JSON.stringify(activity).includes('billing-provisioning-gap'));
  const fin11Names = activity.fin11Planned.map((j) => j.name);
  check('3b. all 3 FIN-11 jobs are listed', JSON.stringify(fin11Names) === JSON.stringify(['fin11-card-collection', 'fin11-card-retry-sweep', 'fin11-masav-prepare']));
  const fin11AllInactive = activity.fin11Planned.every((j) => j.registered === false && j.status === 'not_registered');
  check('3c. every FIN-11 job is honestly reported as not_registered (none presented as operational) -- this guards against ever silently flipping to "active" without this file being revisited', fin11AllInactive, JSON.stringify(activity.fin11Planned));
  const autoHaveRegisteredFlag = activity.automatic.every((j) => typeof j.registered === 'boolean' && j.registered === true);
  check('3d. both monitored automatic jobs are confirmed actually registered in the live job runner', autoHaveRegisteredFlag);

  // --- D. searchStatementHistory -- read-only, filter correctness ---
  const histAll = await svc.searchStatementHistory({ limit: 5 });
  check('4. searchStatementHistory returns an array', Array.isArray(histAll));
  const histNone = await svc.searchStatementHistory({ entityId: '00000000-0000-0000-0000-000000000000' });
  check('4a. an entityId filter matching no entity returns an empty array, not an error or everything', Array.isArray(histNone) && histNone.length === 0, `length=${histNone.length}`);
  if (histAll.length > 0) {
    const target = histAll[0];
    const filtered = await svc.searchStatementHistory({ entityId: target.entity_id, limit: 50 });
    check('4b. an exact entityId match finds the same real statement, never a substring guess', filtered.some((r) => r.id === target.id), `entityId=${target.entity_id}, found ${filtered.length} rows`);
  }

  // --- D2. the date-range OVERLAP fix (2026-10): picking a whole real
  // calendar month must find statements in it -- the previous version
  // (containment, not overlap) found NOTHING for this exact case, because
  // a calendar-month period's period_end is always the 1st of the NEXT
  // month, which always failed period_end <= dateTo. ---
  const sept2026 = await svc.searchStatementHistory({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  check('4c. a date range covering a whole real calendar month finds the real Statement inside it (date-overlap fix)', sept2026.some((r) => r.entity_name === 'קשת נחושה'), `found ${sept2026.length} rows`);

  // --- E. getFinancialReportPreview / generateFinancialReportExcel --
  // SAME shared rows, read-only, correct 6-column header, no write. ---
  const reportPeriod = periods.rows.find(() => true);
  const EXPECTED_HEADER = ['עמותה', 'תקופה', 'סכום לחיוב', 'נגבה', 'יתרה', 'סטטוס'];
  if (reportPeriod) {
    const preview = await svc.getFinancialReportPreview({ periodId: reportPeriod.id });
    check('5. getFinancialReportPreview returns an array', Array.isArray(preview));

    const buffer = await svc.generateFinancialReportExcel({ periodId: reportPeriod.id });
    check('5a. generateFinancialReportExcel returns a real Buffer', Buffer.isBuffer(buffer) && buffer.length > 0, `length=${buffer?.length}`);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    check('5b. the buffer parses as a valid xlsx workbook with a "דוח כספי" sheet', workbook.SheetNames.includes('דוח כספי'), JSON.stringify(workbook.SheetNames));
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets['דוח כספי'], { header: 1 });
    check('5c. the header row matches exactly the approved 6 columns', JSON.stringify(sheetRows[0]) === JSON.stringify(EXPECTED_HEADER), JSON.stringify(sheetRows[0]));
    check('5d. this report is a DIFFERENT file shape from the MASAV bank file (no bank/branch/account columns)', !sheetRows[0].includes('bank') && !sheetRows[0].includes('branch'));

    // The actual consistency guarantee the product owner asked for: same
    // row count AND same amounts, since both come from the one shared
    // getFinancialReportRows() call -- not merely "both non-empty".
    check('5e. the preview and the Excel file show the exact same number of rows', preview.length === sheetRows.length - 1, `preview=${preview.length}, excel=${sheetRows.length - 1}`);
    if (preview.length > 0) {
      const p0 = preview[0];
      const e0 = sheetRows[1];
      check('5f. the FIRST row\'s amounts are identical between preview and Excel (billed/collected/outstanding)', e0[2] === p0.billed && e0[3] === p0.collected && e0[4] === p0.outstanding, `preview=${JSON.stringify(p0)}, excel=${JSON.stringify(e0)}`);
    }
  }
  const emptyPreview = await svc.getFinancialReportPreview({ periodId: '00000000-0000-0000-0000-000000000000' });
  check('5g. a nonexistent periodId\'s preview is an empty array, never a crash or a fabricated row', Array.isArray(emptyPreview) && emptyPreview.length === 0, `length=${emptyPreview.length}`);
  const emptyBuffer = await svc.generateFinancialReportExcel({ periodId: '00000000-0000-0000-0000-000000000000' });
  const emptyWorkbook = XLSX.read(emptyBuffer, { type: 'buffer' });
  const emptyRows = XLSX.utils.sheet_to_json(emptyWorkbook.Sheets['דוח כספי'], { header: 1 });
  check('5h. the same nonexistent periodId produces a valid header-only Excel file, consistent with the empty preview above', emptyRows.length === 1 && JSON.stringify(emptyRows[0]) === JSON.stringify(EXPECTED_HEADER), `rows=${emptyRows.length}`);

  // --- F. entityId scoping on the report -- "כל העמותות" vs one nonprofit ---
  if (reportPeriod) {
    const allEntitiesPreview = await svc.getFinancialReportPreview({ periodId: reportPeriod.id });
    if (allEntitiesPreview.length > 0) {
      const targetName = allEntitiesPreview[0].entityName;
      const stmtRes = await pool.query(`SELECT ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id = s.billing_account_id WHERE s.billing_period_id = $1 AND EXISTS (SELECT 1 FROM entities e WHERE e.id = ba.entity_id AND e.display_name = $2) LIMIT 1`, [reportPeriod.id, targetName]);
      const targetEntityId = stmtRes.rows[0]?.entity_id;
      if (targetEntityId) {
        const scoped = await svc.getFinancialReportPreview({ periodId: reportPeriod.id, entityId: targetEntityId });
        check('6. scoping the report to one entityId returns ONLY that nonprofit\'s rows', scoped.every((r) => r.entityName === targetName), JSON.stringify(scoped.map((r) => r.entityName)));
      }
    }
  }

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
