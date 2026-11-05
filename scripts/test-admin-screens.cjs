'use strict';
// Isolated UI/controller tests. No backend server, HTTP, DB, provider or clock operations.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), rx = require('rxjs');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..'), base = 'src/app/modules/platform/';
const token = name => ({ name });
const decorator = () => () => {};
function load(file, providers = {}, dom = new JSDOM('<button id="trigger">open</button>', { url: 'http://localhost:4200/platform' })) {
  const module = { exports: {} };
  const requireMock = name => {
    if (name === 'rxjs') return rx;
    if (name === 'rxjs/operators') return require(name);
    if (name === '@angular/core') return { Component: decorator, Injectable: decorator, HostListener: decorator, Input: decorator, Output: decorator, ViewChild: decorator,
      EventEmitter: class extends rx.Subject { emit(value) { this.next(value); } }, inject: key => providers[key.name] || {} };
    if (name.includes('admin-display') || name.includes('ops-labels') || name.includes('relative-time')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) + '.ts', providers, dom).exports;
    if (name.includes('approval-reason-tags')) return { APPROVAL_REASON_TAGS: [] };
    if (name.includes('environment')) return { environment: { apiUrl: 'https://mock.invalid' } };
    return new Proxy({}, { get: (_, key) => token(String(key)) });
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText,
    { module, exports: module.exports, require: requireMock, console, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, navigator: { clipboard: { writeText: async () => {} } }, Intl, Date, setTimeout, clearTimeout, URL, Blob, queueMicrotask }, { filename: file });
  return { exports: module.exports, dom };
}
function fixture(screen) {
  const calls = [];
  const response = { partners: [], campaigns: [], organizations: [], users: [], total: 0, page: 0, limit: 25, roles: [], entities: [], auditLog: [], donations: [], findings: [], exceptions: [], actions: [] };
  const service = new Proxy({}, { get: (_, name) => (...args) => { calls.push([String(name), ...args]); return rx.of({ ...response }); } });
  const providers = { PlatformService: service, CardcomOpsService: service, FinanceOpsService: service, CollectionOpsService: service, BillingOpsService: service,
    BillingProvisioningService: service, SimulationClockService: service, BillingSettingsService: service, CampaignResetService: service,
    CurrentContextService: { isSuperAdmin: () => true, hasPlatformSection: () => true }, ActivatedRoute: { snapshot: { queryParamMap: { get: () => null }, paramMap: { get: () => null }, fragment: null } },
    Router: { navigate: (...args) => { calls.push(['navigate', ...args]); } }, HttpClient: { get: (...args) => { calls.push(['GET', ...args]); return rx.of({}); } } };
  const file = `${base}pages/platform-${screen}-page/platform-${screen}-page.component.ts`;
  const result = load(file, providers);
  const key = Object.keys(result.exports).find(name => name.endsWith('Component'));
  return { component: new result.exports[key](), providers, calls, ...result };
}

test('shared formatting preserves cents and Israel DST boundaries, rejects invalid dates', () => {
  const { exports: display } = load(base + 'utils/admin-display.ts');
  assert.match(display.shekels(143.37), /143\.37/);
  assert.equal(display.shekels(null), '—');
  assert.equal(display.israelDate('2026-10-22T21:30:00Z', true), '23/10/2026, 00:30');
  assert.equal(display.israelDate('2026-11-02T18:00:00Z', true), '02/11/2026, 20:00');
  assert.equal(display.israelDate('invalid'), '—');
});
test('organization/campaign filter choices fetch every page and reject incomplete or changing lists', async () => {
  const { exports: { PlatformService } } = load(base + 'services/platform.service.ts'); const service = new PlatformService();
  const pages = [];
  service.getOrganizations = query => { pages.push(query.page); return rx.of({ organizations: query.page ? [{ id: 'b', display_name: 'שנייה' }] : [{ id: 'a', display_name: 'ראשונה' }], total: 2, page: query.page, limit: 1 }); };
  const options = await rx.firstValueFrom(service.getOrganizationFilterOptions());
  assert.equal(options.length, 2); assert.equal(options[1].name, 'שנייה'); assert.deepEqual(pages, [0, 1]);
  service.getOrganizations = () => rx.of({ organizations: [], total: 2, page: 0, limit: 100 });
  await assert.rejects(rx.firstValueFrom(service.getOrganizationFilterOptions()), /changed/);
});
test('partners use their own model and never call an ownership-gated editor or mutation', () => {
  const { component: page, calls } = fixture('partners'); page.ngOnInit();
  page.searchQuery = 'שותף'; page.selectChip('hidden');
  const query = calls.filter(c => c[0] === 'getPartners').at(-1)[1];
  assert.equal(query.hidden, true); assert.equal(query.search, 'שותף'); assert.equal(query.status, undefined);
  assert.equal(page.partnerName({ display_name: '', legal_name: 'שם רשמי' }), 'שם רשמי');
  assert.equal(page.partnerLink({ campaign_slug: null }), null);
  assert.ok(calls.every(c => c[0] === 'getPartners'));
});
test('partners reject stale responses, expose read errors and clear them on retry', () => {
  const { component: page, providers } = fixture('partners');
  const old = new rx.Subject(), next = new rx.Subject(); let count = 0;
  providers.PlatformService.getPartners = () => count++ ? next : old;
  // Proxy methods are intentionally replaced by an explicit test service.
  page.platformService = { getPartners: () => count++ ? next : old }; count = 0;
  page.load(); page.load(); old.next({ partners: [{ id: 'stale' }], total: 1 });
  next.error(new Error('offline')); assert.match(page.error, /לא ניתן/);
  page.platformService = { getPartners: () => rx.of({ partners: [], total: 0 }) }; page.load();
  assert.equal(page.error, null); assert.equal(page.partners.length, 0);
});
test('campaign progress is accurate at and above target; money retains cents', () => {
  const { component: page } = fixture('campaigns');
  assert.equal(page.progressPct({ current_amount: 4050, target_amount: 5000 }), 81);
  assert.equal(page.progressPct({ current_amount: 6000, target_amount: 5000 }), 120);
  assert.equal(page.progressPct({ current_amount: 50, target_amount: 0 }), 0);
  assert.match(page.fmtMoney(143.37), /143\.37/);
});
test('campaign status and duplication wait for explicit confirmation/reason and prevent repeat submission', () => {
  const { component: page, calls } = fixture('campaigns'); const campaign = { id: 'c', title: 'קמפיין', slug: 'test', status: 'draft' };
  page.onStatusChange(campaign, 'paused'); assert.equal(calls.length, 0);
  page.confirmPendingAction(); assert.equal(calls.length, 0); assert.equal(page.noteRequiredError, true);
  const pending = new rx.Subject(); page.platformService = { setCampaignStatus: (...args) => { calls.push(['setCampaignStatus', ...args]); return pending; } };
  page.notesInput = 'אישור לפרסום'; page.confirmPendingAction(); page.confirmPendingAction(); assert.equal(calls.length, 1);
  page.cancelPendingAction(); assert.ok(page.pendingAction); // cannot close an in-flight action
  pending.error({ error: { error: 'rejected' } }); assert.equal(page.pendingActionError, 'rejected'); assert.ok(page.pendingAction);
  page.cancelPendingAction(); page.duplicate(campaign); assert.equal(page.pendingAction.type, 'duplicate'); assert.equal(calls.length, 1);
});
test('campaign details use existing authorized API and clean up failed loading', () => {
  const { component: page } = fixture('campaigns');
  page.platformService = { getCampaign: () => rx.throwError(() => new Error('403')) };
  page.openCampaign({ id: 'c' }); assert.equal(page.detailLoading, false); assert.match(page.detailError, /לא ניתן/); page.closeCampaign(); assert.equal(page.selectedCampaign, null);
});
test('users distinguish account status from full-admin permission and never-login state', () => {
  const { component: page } = fixture('users');
  assert.equal(page.statusBadge({ is_active: true, is_super_admin: true }).label, 'פעיל');
  assert.equal(page.statusBadge({ is_active: false, is_super_admin: true }).label, 'מושבת');
  assert.equal(page.relativeTime(null), 'טרם התחבר');
  page.roleFilter = '2'; page.activeChip = 'active'; page.load();
  assert.equal(page.hasFilters, true);
});
test('user details preserve affiliations and failed detail reads remain visible errors', () => {
  const { component: page } = fixture('users');
  page.platformService = { getUser: () => rx.of({ user: { id: 'u' }, entities: [{ entity_id: 'e', entity_name: 'עמותה' }], auditLog: [] }) };
  page.openUser({ id: 'u' }); assert.equal(page.userDetail.entities[0].entity_id, 'e');
  page.platformService = { getUser: () => rx.throwError(() => new Error('offline')) }; page.openUser({ id: 'u' });
  assert.match(page.detailError, /לא ניתן/); assert.equal(page.detailLoading, false);
});
test('donation summary includes only paid funds and never represents a partial page as complete', () => {
  const { component: page } = fixture('cardcom-ops'); page.donationsLoading = false;
  page.donations = [{ id: 'a', status: 'failed', amount: 999 }, { id: 'b', status: 'paid', amount: 143.37 }, { id: 'c', status: 'pending', amount: 500 }]; page.donationsTotal = 3;
  assert.equal(page.donationSummary.paidAmount, 143.37); assert.equal(page.donationSummary.paidCount, 1); assert.equal(page.donationSummary.failedCount, 1);
  page.donationsTotal = 100; assert.equal(page.donationSummary, null);
  page.donationsTotal = 3; page.donationsRefreshing = true; assert.equal(page.donationSummary, null);
});
test('full server summary remains authoritative across pages and payment method is never guessed', () => {
  const { component: page } = fixture('cardcom-ops'); page.donationsLoading = false; page.donationsTotal = 100; page.donations = [{ id: 'one' }];
  page.serverDonationSummary = { paidAmount: 143.37, paidCount: 1, failedCount: 99 };
  assert.equal(page.donationSummary.paidAmount, 143.37); assert.equal(page.donationSummary.failedCount, 99);
  assert.equal(page.donationPaymentLabel({ payment_method: 'card' }), 'אשראי'); assert.equal(page.donationPaymentLabel({ payment_method: null }), 'לא זמין');
});
test('an older Backend cannot silently ignore newly selected donation filters', () => {
  const { component: page } = fixture('cardcom-ops'); page.donationsRecurring = 'true';
  page.cardcomOps = { listDonations: () => rx.of({ donations: [{ id: 'wrong' }], total: 1 }) }; page.loadDonations();
  assert.match(page.donationsError, /גרסת שרת תואמת/); assert.equal(page.donations.length, 0);
});
test('new user entity/status/role/admin filters remain independently composable', () => {
  const { component: page, calls } = fixture('users'); page.entityFilter = 'entity'; page.superAdminOnly = true; page.activeChip = 'disabled'; page.roleFilter = '2';
  page.platformService = { getUsers: query => { calls.push(query); return rx.of({ adminListVersion: 1, users: [], total: 0 }); }, getOrganizationFilterOptions: () => rx.of([]) };
  page.load(); assert.equal(calls[0].entityId, 'entity'); assert.equal(calls[0].superAdminOnly, true); assert.equal(calls[0].status, 'disabled'); assert.equal(calls[0].roleId, 2);
});
test('donation details never execute provider verification or assume a payment method', () => {
  const { component: page, calls } = fixture('cardcom-ops'); page.openDonation({ id: 'd', status: 'failed', failure_reason: '605' });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'GET'); assert.match(calls[0][1], /\/api\/platform\/cardcom-ops\/donations\/d$/);
  assert.match(page.failureExplanation({ failure_diagnostic: { providerCode: 605 } }), /חסום/);
  assert.equal(page.failureExplanation({ failure_reason: 'CardCom 605' }), 'סיבת הכישלון אינה ידועה');
  assert.equal(page.failureExplanation({ failure_reason: 'technical_failure' }), 'סיבת הכישלון אינה ידועה');
});
test('CSV export follows all filters/pages, preserves failed records as failed and escapes formulas', async () => {
  const { component: page, dom } = fixture('cardcom-ops'); page.donationsLoading = false; page.donationsTotal = 30; page.donationsSearch = 'בדיקה'; page.donationsStatus = 'failed';
  const calls = []; const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), created_at: '2026-10-23T00:00:00Z', donor_name: '=FORMULA()', is_anonymous: false, amount: 143.37, status: 'failed', entity_name: 'עמותה', campaign_title: 'קמפיין' }));
  page.cardcomOps = { listDonations: query => { calls.push(query); return rx.of({ total: 30, donations: rows.slice(query.page * 25, (query.page + 1) * 25) }); } };
  const create = URL.createObjectURL; let blob;
  URL.createObjectURL = value => { blob = value; return 'blob:test'; }; dom.window.HTMLAnchorElement.prototype.click = () => {};
  try { await page.exportDonationsCsv(); assert.equal(calls.length, 2); assert.ok(calls.every(query => query.status === 'failed' && query.search === 'בדיקה')); const csv = await blob.text(); assert.equal(csv.split('\r\n').length, 31); assert.match(csv, /'=FORMULA/); assert.match(csv, /143\.37/); assert.equal(page.donationsError, null); }
  finally { URL.createObjectURL = create; }
});
test('paid historical collection failure leaves active attention using the existing authoritative projection', () => {
  const { component: page } = fixture('cardcom-ops'); page.financialAttentionReady = true; page.financialAttentionIds = new Set();
  page.centerFindings = [{ id: 1, finding_type: 'fin11_card_attempts_exhausted', severity: 'warning', subject_type: 'statement', subject_id: 'paid', details: {}, found_at: '2026-10-23T10:00:00Z', resolved_at: null }, { id: 2, finding_type: 'lookup_failed', severity: 'critical', subject_type: 'statement', subject_id: 'uncertain', details: { amount: 0 }, found_at: '2026-10-23T10:00:00Z', resolved_at: null }];
  assert.equal(page.filteredCenterRows.length, 1); assert.equal(page.filteredCenterRows[0].finding.subject_id, 'uncertain');
  page.centerStatus = 'resolved'; assert.equal(page.filteredCenterRows[0].finding.subject_id, 'paid');
  assert.equal(page.centerFindings[0].resolved_at, null); // display classification never changes the persisted finding
});
test('uncertain open findings and financial exceptions remain open even at zero amounts', () => {
  const { component: page } = fixture('cardcom-ops');
  page.centerFindings = [{ id: 1, finding_type: 'lookup_failed', severity: 'critical', subject_type: 'statement', subject_id: 's', details: { amount: 0 }, found_at: '2026-10-23T10:00:00Z', resolved_at: null }];
  page.centerPayments = [{ id: 'p', statement_id: 's', entity_id: 'e', entity_name: 'עמותה', overpayment_amount: '0', detected_at: '2026-10-23T10:00:00Z', status: 'open', hold_new_collection: true }];
  assert.equal(page.filteredCenterRows.length, 2); assert.equal(page.centerStatementId(page.filteredCenterRows[0]), 's');
  page.centerStatus = 'resolved'; assert.equal(page.filteredCenterRows.length, 0);
});
test('exception filters retain distinct records, deduplicate only exact IDs and sort urgency first', () => {
  const { component: page } = fixture('cardcom-ops');
  const finding = { id: 1, finding_type: 'unknown_internal_code', severity: 'warning', details: { entityName: 'עמותת בדיקה' }, found_at: '2026-10-23T10:00:00Z', resolved_at: null };
  page.centerFindings = [finding, finding, { ...finding, id: 2, severity: 'critical' }];
  assert.equal(page.filteredCenterRows.length, 2); assert.equal(page.filteredCenterRows[0].severity, 'critical');
  assert.equal(page.findingTypeLabel('unknown_internal_code'), 'ממצא המחייב בדיקה');
  page.centerSearch = 'בדיקה'; page.centerDateFrom = '2026-10-24'; assert.equal(page.filteredCenterRows.length, 0);
});
test('history errors do not become false empty success; older responses cannot overwrite newer filters', () => {
  const { component: page } = fixture('collection-ops'); const old = new rx.Subject(), latest = new rx.Subject(); let index = 0;
  page.collectionOps = { searchHistory: () => index++ ? latest : old }; page.runHistorySearch(); page.runHistorySearch();
  latest.next({ statements: [{ id: 'new' }] }); old.next({ statements: [{ id: 'old' }] }); assert.equal(page.historyRows[0].id, 'new');
  page.collectionOps = { searchHistory: () => rx.throwError(() => new Error('offline')) }; page.runHistorySearch(); assert.match(page.historyError, /לא ניתן/);
  page.historyFilters.dateFrom = '2026-11-01'; page.historyFilters.dateTo = '2026-10-01'; page.runHistorySearch(); assert.match(page.historyError, /תאריך/);
});
test('report export is blocked for stale/loading/error previews without changing financial actions', () => {
  const { component: page, calls } = fixture('collection-ops'); page.reportRows = [{ entityName: 'x' }]; page.reportPreviewLoading = true; page.downloadReport(); assert.equal(calls.length, 0);
  page.reportPreviewLoading = false; page.reportError = 'offline'; page.downloadReport(); assert.equal(calls.length, 0);
  page.reportPeriodMode = 'period'; page.selectedPeriodId = null; page.runReportPreview(); assert.equal(page.reportRows.length, 0);
});
test('simulation display uses Israel format and its reset confirmation cannot close while busy', () => {
  const { component: page, calls } = fixture('general-settings'); page.fixedDateInput = '2026-10-28'; assert.equal(page.selectedBusinessDateLabel, '28/10/2026');
  assert.equal(page.fmtDateTime('2026-10-28T18:00:00Z'), '28/10/2026, 20:00');
  page.resetConfirmOpen = true; page.resetBusy = true; page.closeResetConfirmation(); assert.equal(page.resetConfirmOpen, true);
  page.resetBusy = false; page.closeResetConfirmation(); assert.equal(page.resetConfirmOpen, false); assert.equal(calls.length, 0);
});
test('organization management choices match state; opening confirmation never invokes action', () => {
  const { component: page, calls } = fixture('organization-detail');
  page.entity = { status: 'active' }; assert.deepEqual(Array.from(page.managementActions, a => a.key), ['suspend']);
  page.openManagementAction('approve'); assert.equal(page.pendingManagementAction, null);
  page.entity.flagged_for_review = true; assert.equal(page.managementActions[0].label, 'אישור בדיקה חוזרת'); page.entity.flagged_for_review = false;
  page.entity.status = 'suspended'; assert.deepEqual(Array.from(page.managementActions, a => a.key), ['reactivate']);
  page.entity.status = 'pending_review'; page.openManagementAction('approve'); assert.equal(page.pendingManagementAction, 'approve'); assert.equal(calls.length, 0);
});
test('business timeline hides technical payloads, retains distinct audit records and full audit data', () => {
  const { component: page } = fixture('organization-detail'); page.entity = { id: 'e', created_at: '2026-10-01T00:00:00Z' };
  page.auditLog = [{ id: '1', action: 'approve', notes: '{"secret_id":"raw"}', created_at: '2026-10-02T00:00:00Z' }, { id: '2', action: 'approve', notes: 'different action', created_at: '2026-10-02T00:00:00Z' }, { id: '3', action: 'technical_event_name', notes: 'raw', created_at: '2026-10-02T00:00:00Z' }];
  assert.equal(page.timeline.filter(event => event.id.startsWith('audit:')).length, 2);
  assert.ok(page.timeline.every(event => !event.label.includes('secret_id') && !event.label.includes('technical_event')));
  assert.equal(page.auditLog.length, 3); assert.equal(page.actionLabel('technical_event_name'), 'פעולת ניהול');
});
test('all new screen templates keep retry, RTL/table overflow and do not wire new execution jobs', () => {
  for (const screen of ['partners', 'campaigns', 'users', 'cardcom-ops', 'general-settings', 'organization-detail']) {
    const html = fs.readFileSync(path.join(root, base, `pages/platform-${screen}-page/platform-${screen}-page.component.html`), 'utf8');
    assert.match(html, /נסה שוב|load\(\)/, screen); assert.doesNotMatch(html, /runJob\(|window\.alert\(|window\.confirm\(/, screen);
    assert.doesNotMatch(html, /\?{4,}/, screen);
  }
});
