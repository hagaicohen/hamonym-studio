'use strict';
// Isolated component tests: no browser session, live API, DB or provider access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const componentFile = 'src/app/modules/platform/pages/platform-dashboard-page/platform-dashboard-page.component.ts';

function overview(overrides = {}) {
  return { version: 1, generatedAt: '2026-10-22T21:30:00Z', period: { start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' },
    kpis: { activeEntities: 1, activeCampaigns: 2, donationsMonth: 143.37, newDonorsThisMonth: 1, feesOutstanding: 0, attentionCount: 0 },
    newDonors: [{ name: 'תורם בדיקה', firstDonationAt: '2026-10-05T21:30:00Z', firstDonationAmount: 143.37 }],
    trend: { range: '30d', points: [{ date: '2026-10-01', value: 143.37 }], total: 143.37, previousTotal: 0 },
    attention: [], activity: [], ...overrides };
}

function fixture({ superAdmin = true, params = {} } = {}) {
  const state = { reads: [], handlers: [], unsubscribed: 0 };
  const service = { getOverview: range => ({ subscribe(handler) { state.reads.push(range); state.handlers.push(handler); return { unsubscribe() { state.unsubscribed++; } }; } }) };
  const tokens = { PlatformDashboardService: service, CurrentContextService: { isSuperAdmin: () => superAdmin, hasPlatformSection: () => true } };
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, componentFile), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
  const decorator = () => () => {};
  vm.runInNewContext(js, { module, exports: module.exports, Date, Intl, setTimeout, clearTimeout,
    require(name) {
      if (name === '@angular/core') return { Component: decorator, HostListener: decorator, ViewChild: decorator, inject: token => { assert.ok(tokens[token.name], token.name); return tokens[token.name]; } };
      if (name === '@angular/common') return { CommonModule: class {} };
      if (name === '@angular/router') return { RouterLink: class {} };
      const key = name.endsWith('/platform-dashboard.service') ? 'PlatformDashboardService' : name.endsWith('/current-context.service') ? 'CurrentContextService' : null;
      assert.ok(key, 'Blocked import: ' + name); return { [key]: { [key]: class {} }[key] };
    },
  });
  return { page: new module.exports.PlatformDashboardPageComponent(), state };
}

test('opening dashboard performs only its read and accepts matching card/Drawer data', () => {
  const { page, state } = fixture(); page.ngOnInit(); assert.deepEqual(state.reads, ['30d']);
  state.handlers[0].next(overview()); assert.equal(page.loading, false); assert.equal(page.data.kpis.newDonorsThisMonth, page.visibleDonors.length);
  assert.equal(page.visibleDonors[0].firstDonationAmount, 143.37);
});

test('mismatched donor count and unsupported API version produce an error instead of invented data', () => {
  const { page, state } = fixture(); page.load();
  state.handlers[0].next(overview({ newDonors: [] })); assert.ok(page.error); assert.equal(page.data, null);
  page.load(); state.handlers[1].next(overview({ version: 0 })); assert.ok(page.error); assert.equal(page.data, null);
});

test('failed requests expose retry; a stale Backend explicitly reports incompatible deployment', () => {
  const { page, state } = fixture(); page.load(); state.handlers[0].error({ status: 404 });
  assert.match(page.error, /גרסת שרת/); assert.equal(page.loading, false); assert.equal(page.data, null);
  page.load(); assert.equal(page.error, null); state.handlers[1].next(overview()); assert.ok(page.data);
});

test('rapid range changes and component destruction ignore stale responses', () => {
  const { page, state } = fixture(); page.load('7d'); page.load('12m');
  state.handlers[1].next(overview({ trend: { range: '12m', points: [], total: 0, previousTotal: 0 } }));
  state.handlers[0].next(overview()); assert.equal(page.range, '12m'); assert.equal(state.unsubscribed, 1);
  page.ngOnDestroy(); state.handlers[1].next(overview()); assert.equal(page.range, '12m'); assert.equal(state.unsubscribed, 2);
});

test('Drawer opens with keyboard focus, closes on Escape, and returns focus to its card', async () => {
  const { page, state } = fixture(); page.load(); state.handlers[0].next(overview());
  const dom = new JSDOM('<button id="card"></button><aside><button id="close"></button><button id="next"></button></aside>');
  const doc = dom.window.document, card = doc.getElementById('card'), close = doc.getElementById('close');
  page.drawerClose = { nativeElement: close }; page.donorDrawer = { nativeElement: doc.querySelector('aside') };
  card.focus(); page.openDonors(card); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(page.donorsOpen, true); assert.equal(doc.activeElement, close);
  page.onDrawerKey({ key: 'Tab', shiftKey: true, preventDefault() {} }); assert.equal(doc.activeElement.id, 'next');
  page.onDrawerKey({ key: 'Tab', shiftKey: false, preventDefault() {} }); assert.equal(doc.activeElement, close);
  page.onDrawerKey({ key: 'Escape', preventDefault() {} }); assert.equal(page.donorsOpen, false); assert.equal(doc.activeElement, card);
  page.ngOnDestroy(); dom.window.close();
});

test('scoped admin cannot open the donor Drawer', () => {
  const { page, state } = fixture({ superAdmin: false }); page.load(); state.handlers[0].next(overview());
  page.openDonors({ focus() {} }); assert.equal(page.donorsOpen, false);
});

test('attention stays limited to five visible items; all are reachable and count agrees', () => {
  const { page, state } = fixture(); const attention = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));
  page.load(); state.handlers[0].next(overview({ attention, kpis: { ...overview().kpis, attentionCount: 12 } }));
  assert.equal(page.visibleAttention.length, 5); assert.equal(page.attentionPages, 3);
  page.attentionPage = 2; assert.equal(page.visibleAttention.length, 2);
  const section = { focus() {}, scrollIntoView() {} }; page.focusAttention(section); assert.equal(page.attentionPage, 0);
});

test('donor pagination preserves every donor and empty state does not invent rows', () => {
  const { page, state } = fixture(); const newDonors = Array.from({ length: 23 }, (_, i) => ({ ...overview().newDonors[0], name: String(i) }));
  page.load(); state.handlers[0].next(overview({ newDonors, kpis: { ...overview().kpis, newDonorsThisMonth: 23 } }));
  assert.equal(page.visibleDonors.length, 20); page.donorPage = 1; assert.equal(page.visibleDonors.length, 3);
  page.load(); state.handlers[1].next(overview({ newDonors: [], kpis: { ...overview().kpis, newDonorsThisMonth: 0 } }));
  assert.equal(page.visibleDonors.length, 0); assert.equal(page.donorPage, 0);
});

test('money preserves cents, unavailable amounts stay unavailable, dates use Israel timezone', () => {
  const { page } = fixture(); assert.match(page.fmtMoney(143.37), /143\.37/); assert.equal(page.fmtMoney(null), '—');
  assert.equal(page.fmtDate('2026-10-22T21:30:00Z'), '23/10/2026');
  assert.equal(page.fmtDate('2026-10-28T18:00:00Z', true), '28/10/2026, 20:00');
});

test('trend handles zero and previous-period zero without misleading percentages or broken SVG', () => {
  const { page, state } = fixture(); page.load(); state.handlers[0].next(overview());
  assert.equal(page.comparisonPercent, null); assert.equal(page.hasDonations, true); assert.ok(!page.linePath.includes('NaN'));
  page.data.trend = { range: '7d', points: [], total: 0, previousTotal: 0 };
  assert.equal(page.hasDonations, false); assert.equal(page.linePath, ''); assert.equal(page.lineAreaPath, '');
});

test('Recent Activity deduplicates business record identities, never distinct events by text or time', () => {
  const { page, state } = fixture();
  const event = { id: 'donation:1', name: 'אותו קמפיין', label: 'התקבלה תרומה', timestamp: '2026-10-22T10:00:00Z', amount: 100, route: ['/platform/donations'], query: {} };
  const activity = [event, { ...event }, { ...event, id: 'donation:2' }];
  page.load(); state.handlers[0].next(overview({ activity }));
  assert.equal(page.recentActivity.length, 2);
  assert.equal(page.recentActivity[1].id, 'donation:2');
  assert.equal(activity.length, 3);
});

test('template has six KPI types, true links, accessible Drawer and distinct empty/error states', () => {
  const html = fs.readFileSync(path.join(root, componentFile.replace('.ts', '.html')), 'utf8');
  assert.match(html, /role="dialog" aria-modal="true"/); assert.match(html, /שם לא זמין/);
  assert.match(html, /אין תורמים חדשים בתקופה זו/); assert.match(html, /נסה שוב/);
  assert.match(html, /status: 'published'/); assert.match(html, /period: 'this_month_israel'/);
  assert.doesNotMatch(html, /window\.alert|window\.confirm|entitiesWeekly|activityFilters/);
});

// Minimal deep-link integration only. Destination services are inert spies;
// no real HTTP, clock or financial operations can be imported in this VM.
function destination(pageName, query = {}, fragment = null) {
  const calls = [], tokens = new Map();
  const route = { snapshot: { queryParamMap: { get: key => query[key] || null }, fragment } };
  const module = { exports: {} };
  function token(name) {
    if (!tokens.has(name)) tokens.set(name, { [name]: class {} }[name]);
    return tokens.get(name);
  }
  const api = name => new Proxy({}, { get(_, method) {
    return (...args) => {
      assert.match(String(method), /^(get|list|search)/, 'Blocked non-read method: ' + name + '.' + String(method));
      calls.push({ name, method, args }); return { subscribe() { return { unsubscribe() {} }; } };
    };
  } });
  const decorators = () => () => {};
  const file = 'src/app/modules/platform/pages/' + pageName + '/' + pageName + '.component.ts';
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, Date, Intl, setTimeout, clearTimeout, localStorage: { getItem: () => null },
    require(name) {
      if (name === '@angular/core') return { Component: decorators, HostListener: decorators, inject: t => t.name === 'ActivatedRoute' ? route : t.name === 'CurrentContextService' ? { hasPlatformSection: () => false } : api(t.name) };
      if (name.endsWith('/environment')) return { environment: { apiUrl: 'http://isolated.invalid' } };
      return new Proxy({}, { get: (_, key) => token(key) });
    },
  });
  const Page = Object.entries(module.exports).find(([name]) => name.endsWith('PageComponent'))[1];
  const page = new Page(); page.ngOnInit();
  return { page, calls };
}

test('active-campaign KPI opens the existing list with published filter applied', () => {
  const { page, calls } = destination('platform-campaigns-page', { status: 'published', search: 'קמפיין בדיקה' });
  assert.equal(page.activeChip, 'published');
  const read = calls.find(c => c.method === 'getCampaigns'); assert.equal(read.args[0].status, 'published'); assert.equal(read.args[0].search, 'קמפיין בדיקה');
});

test('donations KPI passes paid/current-month scope into the existing donation reader', () => {
  const { calls, page } = destination('platform-cardcom-ops-page', { status: 'paid', period: 'this_month_israel' });
  const read = calls.find(c => c.method === 'listDonations'); assert.equal(read.args[0].period, 'this_month_israel'); assert.equal(read.args[0].status, 'paid');
  page.clearDashboardScope(); assert.equal(page.donationsPeriod, ''); assert.equal(page.donationsCampaignId, undefined);
});

test('donation event applies its campaign filter and opens provider anomalies when requested', () => {
  const id = '5f9fb2b7-7d39-44db-92a0-f450b552e2e4';
  const { calls, page } = destination('platform-cardcom-ops-page', { status: 'paid', campaignId: id }, 'anomalies');
  const read = calls.find(c => c.method === 'listDonations'); assert.equal(read.args[0].campaignId, id); assert.equal(page.showAnomalies, true);
});

test('user event links to the existing user search', () => {
  const { calls } = destination('platform-users-page', { search: 'משתמש בדיקה' });
  assert.equal(calls.find(c => c.method === 'getUsers').args[0].search, 'משתמש בדיקה');
});

test('fee card opens existing all-period report; financial attention opens statement read only', () => {
  const id = '2249d280-5bd5-4225-a016-fc62c1255868';
  const { page, calls } = destination('platform-collection-ops-page', { tab: 'reports', scope: 'all', statementId: id });
  assert.equal(page.tab, 'reports'); assert.equal(page.reportPeriodMode, 'all');
  assert.equal(calls.find(c => c.method === 'getStatement').args[0], id);
  assert.ok(calls.some(c => c.method === 'getReportPreview'));
});
