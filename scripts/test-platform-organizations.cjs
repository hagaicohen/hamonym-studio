'use strict';
// Isolated Organizations screen/read-API regressions. No real requires of
// application services, database, jobs, email or payment adapters are allowed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const file = 'src/app/modules/platform/pages/platform-organizations-page/platform-organizations-page.component.ts';

function fixture(query = {}) {
  const state = { calls: [], handlers: [], navigations: [], unsubscribed: 0, timers: new Map(), exports: [] };
  let timerId = 0;
  const service = { getOrganizations: params => ({ subscribe(handler) {
    state.calls.push(params); state.handlers.push(handler); return { unsubscribe() { state.unsubscribed++; } };
  } }) };
  const router = { navigate: (...args) => { state.navigations.push(args); return Promise.resolve(true); } };
  const route = { snapshot: { queryParamMap: { get: key => query[key] ?? null } } };
  const tokens = { PlatformService: service, Router: router, ActivatedRoute: route, CurrentContextService: { isSuperAdmin: () => true } };
  const module = { exports: {} }, decorator = () => () => {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
  const names = new Map();
  const token = name => { if (!names.has(name)) names.set(name, { [name]: class {} }[name]); return names.get(name); };
  vm.runInNewContext(js, { module, exports: module.exports, Date, Intl, window: { innerWidth: 390, innerHeight: 844 },
    document: { getElementById: () => ({ focus() { state.menuFocused = true; } }) },
    setTimeout(fn) { const id = ++timerId; state.timers.set(id, fn); return id; }, clearTimeout(id) { state.timers.delete(id); },
    require(name) {
      if (name === '@angular/core') return { Component: decorator, HostListener: decorator, inject: t => { assert.ok(tokens[t.name], 'Unexpected service: ' + t.name); return tokens[t.name]; } };
      if (name.endsWith('/relative-time')) return { relativeTime: () => 'לפני יום' };
      if (name === 'xlsx') return { utils: { json_to_sheet: rows => rows, book_new: () => ({}), book_append_sheet(book, rows) { book.rows = rows; } }, writeFile: (book, filename) => state.exports.push({ book, filename }) };
      assert.ok(['@angular/common', '@angular/forms', '@angular/router', '../../services/platform.service', '../../../../core/services/current-context.service', '../../components/column-picker/column-picker.component'].includes(name), 'Blocked import: ' + name);
      return new Proxy({}, { get: (_, key) => token(key) });
    },
  });
  return { page: new module.exports.PlatformOrganizationsPageComponent(), state };
}

test('status, missing fields and other filters combine instead of replacing one another', () => {
  const { page, state } = fixture({ status: 'active', missingDocs: '1', flaggedForReview: 'true', noCampaigns: '1' });
  page.ngOnInit(); const call = state.calls[0];
  assert.equal(call.status, 'active'); assert.equal(call.missingDocs, true); assert.equal(call.flaggedForReview, true); assert.equal(call.noCampaigns, true);
  page.selectStatus('suspended'); assert.equal(state.calls[1].status, 'suspended'); assert.equal(state.calls[1].missingDocs, true);
  page.toggleFilter('missing_docs'); assert.equal(state.calls[2].status, 'suspended'); assert.equal(state.calls[2].missingDocs, undefined);
});

test('existing notification links keep all-status semantics and restore search/sort/page context', () => {
  const { page, state } = fixture({ missingDocs: '1', search: 'עמותה', sortBy: 'activity', sortDir: 'asc', page: '2' });
  page.ngOnInit(); assert.equal(page.activeStatus, 'all'); assert.equal(state.calls[0].status, undefined);
  assert.equal(page.page, 2); assert.equal(state.calls[0].sortBy, 'activity');
  page.openOrganization({ id: 'org-1' }); const navigation = state.navigations[0];
  assert.deepEqual(Array.from(navigation[0]), ['/platform/organizations', 'org-1']);
  assert.equal(navigation[1].queryParams.missingDocs, '1'); assert.equal(navigation[1].queryParams.page, '2'); assert.equal(navigation[1].queryParams.search, 'עמותה');
});

test('untrusted query state is validated; legacy attribute links remain usable', () => {
  const { page, state } = fixture({ status: 'missing_docs', sortBy: 'DROP TABLE', page: '-2' }); page.ngOnInit();
  assert.equal(page.activeStatus, 'all'); assert.equal(state.calls[0].missingDocs, true); assert.equal(page.page, 0); assert.equal(page.sortField, 'created_at');
});

test('sorting and pagination retain independent filters', () => {
  const { page, state } = fixture({ status: 'active', noCampaigns: '1' }); page.ngOnInit();
  state.handlers[0].next({ organizations: [{ id: 'a' }], total: 60, unfilteredTotal: 70 });
  page.sortBy('activity'); assert.equal(page.sortAria('activity'), 'ascending'); assert.equal(page.sortMark('activity'), '↑');
  page.sortBy('activity'); assert.equal(page.sortAria('activity'), 'descending');
  page.nextPage(); assert.equal(page.page, 1); assert.equal(state.calls.at(-1).noCampaigns, true);
});

test('new filters cancel debounced searches, and stale reads cannot replace the current list', () => {
  const { page, state } = fixture(); page.ngOnInit(); page.onSearch(); assert.equal(state.timers.size, 1);
  page.selectStatus('all'); assert.equal(state.timers.size, 0);
  state.handlers[1].next({ organizations: [{ id: 'current' }], total: 1, unfilteredTotal: 4 });
  state.handlers[0].next({ organizations: [{ id: 'stale' }], total: 1 }); assert.equal(page.organizations[0].id, 'current');
  page.ngOnDestroy(); assert.equal(state.unsubscribed, 2);
});

test('errors preserve visible rows, expose retry and clear after successful reload', () => {
  const { page, state } = fixture(); page.ngOnInit(); state.handlers[0].next({ organizations: [{ id: 'a' }], total: 1 });
  page.load(); state.handlers[1].error({}); assert.equal(page.organizations.length, 1); assert.ok(page.error); assert.equal(page.refreshing, false);
  page.load(); assert.equal(page.error, null); state.handlers[2].next({ organizations: [], total: 0, unfilteredTotal: 0 }); assert.equal(page.unfilteredTotal, 0);
});

test('older Backend responses do not claim unsupported sorting or fabricate missing campaign/profile data', () => {
  const { page, state } = fixture({ sortBy: 'activity', sortDir: 'asc' }); page.ngOnInit();
  state.handlers[0].next({ organizations: [{ id: 'a', campaigns_count: 2 }], total: 1 });
  assert.equal(page.extendedOrganizationDataAvailable, false); assert.equal(page.sortField, 'created_at');
  assert.equal(page.sortDir, 'asc'); assert.equal(page.organizations[0].active_campaigns_count, undefined);
});

test('clear filters resets their scope, search and page; never performs a mutation', () => {
  const { page, state } = fixture({ status: 'suspended', missingDocs: '1', search: 'x', page: '2' }); page.ngOnInit(); page.clearFilters();
  assert.equal(page.activeStatus, 'all'); assert.equal(page.searchQuery, ''); assert.equal(page.page, 0); assert.equal(page.selectedFilters.size, 0); assert.equal(state.calls.at(-1).status, undefined);
});

test('dates use Israel timezone and amounts retain cents', () => {
  const { page } = fixture(); assert.equal(page.fmtDate('2026-10-22T21:30:00Z'), '23/10/2026');
  assert.equal(page.fmtDate('2026-10-28T18:00:00Z', true), '28/10/2026, 20:00'); assert.match(page.fmtMoney(143.37), /143\.37/);
});

test('action labels follow actual status, menu stays within narrow viewport and Escape restores focus', () => {
  const { page } = fixture(); assert.equal(page.actionLabel({ status: 'pending_review' }), 'בדיקת הבקשה');
  assert.equal(page.actionLabel({ status: 'active', flagged_for_review: true }), 'בדיקה חוזרת');
  assert.equal(page.actionLabel({ status: 'suspended' }), 'צפייה בפרטים');
  let focused = false;
  page.openActionMenu({ id: 'a' }, { stopPropagation() {}, currentTarget: { getBoundingClientRect: () => ({ right: 12, bottom: 830 }), focus() { focused = true; } } });
  assert.ok(page.menuPosition.right >= 8); assert.ok(page.menuPosition.right <= 182); assert.ok(page.menuPosition.top <= 780);
  page.escapeMenu(); assert.equal(page.actionOrganization, null); assert.equal(focused, true);
});

test('Tab reaches the floating action menu without changing navigation or data', () => {
  const { page, state } = fixture(); const trigger = { getBoundingClientRect: () => ({ right: 100, bottom: 200 }) };
  page.openActionMenu({ id: 'a' }, { stopPropagation() {}, currentTarget: trigger });
  let prevented = false; page.focusMenuAction({ target: trigger, shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(state.menuFocused, true); assert.equal(state.calls.length, 0);
});

test('Excel uses the same filters, prevents duplicate submission and preserves actual cents', async () => {
  const { page, state } = fixture({ status: 'active', missingDocs: '1' }); page.ngOnInit();
  const org = { id: 'a', display_name: 'עמותה', status: 'active', total_raised: 143.37, campaigns_count: 2, active_campaigns_count: 1, missing_profile_fields: ['אישור סעיף 46'], created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-22T10:00:00Z' };
  state.handlers[0].next({ organizations: [org], total: 1 }); page.exportExcel(); page.exportExcel();
  assert.equal(state.calls.length, 2); assert.equal(state.calls[1].missingDocs, true); assert.equal(state.calls[1].status, 'active');
  await state.handlers[1].next({ organizations: [org], total: 1 });
  assert.equal(state.exports.length, 1); assert.equal(state.exports[0].book.rows[0]['סכום מצטבר שגויס'], 143.37); assert.equal(page.exportBusy, false);
});

test('an incomplete or failed export is never reported as success', async () => {
  const { page, state } = fixture(); page.ngOnInit(); state.handlers[0].next({ organizations: [{ id: 'a' }], total: 1 });
  page.exportExcel(); await state.handlers[1].next({ organizations: [], total: 1 }); assert.ok(page.error); assert.equal(state.exports.length, 0);
  page.exportExcel(); state.handlers[2].error({}); assert.equal(page.exportBusy, false); assert.equal(state.exports.length, 0);
});

test('template exposes missing information honestly and includes real links, sorting, empty/error states', () => {
  const html = fs.readFileSync(path.join(root, file.replace('.ts', '.html')), 'utf8');
  assert.match(html, /missing_profile_fields\[0\]/); assert.match(html, /active_campaigns_count \?\? '—'/);
  assert.match(html, /unfilteredTotal === 0/); assert.match(html, /לא נמצאו עמותות התואמות לסינון/);
  assert.match(html, /role="alert"/); assert.match(html, /נסה שוב/); assert.match(html, /\[queryParams\]="listQuery"/);
  assert.doesNotMatch(html, /style.width.%|profile_completion }}%|window.confirm|approve\(/);
  assert.match(html, /<details class="additional-filters"><summary>סינון נוסף/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b|visibleColumns.has\('created_at'\)|fmtDate\(org.updated_at, true\)/);
  assert.match(html, /פעילים: {{ org.active_campaigns_count/);
  assert.match(html, /מתוך {{ org.campaigns_count }} בסך הכול/);
  assert.match(html, /{{ org.missing_profile_fields.length }} להשלמה/);
  assert.match(html, /<option value="created_at">תאריך הרשמה/);
});

function readApi() {
  const queries = [], module = { exports: {} };
  const db = { async query(sql, params) {
    assert.match(sql.trim(), /^SELECT/); assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CALL)\b/i);
    queries.push({ sql, params });
    return { rows: sql.includes('AS missing_profile_fields') ? [{ id: 'org-1', missing_profile_fields: ['אישור סעיף 46'], active_campaigns_count: 1, campaigns_count: 3 }] : [{ total: params === undefined ? 5 : 1 }] };
  } };
  const allowed = new Set(['crypto', 'jsonwebtoken', 'bcrypt', '../entities/entities.service', '../ambassadors/ambassadors.service', '../donations/donations.service', '../email/email.service', '../email/admin-notification.service', '../billing-engine/provisioning.service']);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'hamonym-backend/src/modules/platform/platform.service.js'), 'utf8'), {
    module, exports: module.exports,
    require(name) { if (name === '../../db/db') return db; assert.ok(allowed.has(name), 'Blocked import: ' + name); return {}; },
  });
  return { api: module.exports, queries };
}

test('read API searches names, registration number and owners using bound parameters', async () => {
  const { api, queries } = readApi(); const search = "' OR 1=1 --";
  await api.getOrganizations({ search, status: 'active', missingDocs: true, flaggedForReview: true, noCampaigns: true });
  assert.equal(queries.length, 3);
  for (const q of queries.slice(0, 2)) {
    assert.match(q.sql, /e.registration_number::text ILIKE/); assert.match(q.sql, /u.full_name ILIKE/); assert.match(q.sql, /ue.role = 'owner'/);
    assert.ok(q.params.includes('%' + search + '%')); assert.ok(!q.sql.includes(search));
    assert.match(q.sql, /e.flagged_for_review = true/); assert.match(q.sql, /campaigns_count, 0\) = 0/);
    assert.match(q.sql, /er.role = 'partner'/); assert.match(q.sql, /e.status != 'deleted'/);
  }
});

test('missing-field projection mirrors the existing profile formula and does not require tax docs for non-associations', async () => {
  const { api, queries } = readApi(); await api.getOrganizations({}); const sql = queries[0].sql;
  assert.match(sql, /ARRAY_REMOVE/); assert.match(sql, /NOT \(e.entity_type = 'association'\) OR e.tax_document_name IS NOT NULL/);
  assert.match(sql, /e.cardcom_connection_status IS DISTINCT FROM 'success'/);
  assert.match(sql, /NULLIF\(e.display_name, ''\) IS NULL/); assert.match(sql, /AS profile_completion/);
});

test('active and total campaigns come from the same nondeleted records; total population distinguishes empty from filtered', async () => {
  const { api, queries } = readApi(); const result = await api.getOrganizations({ status: 'active', sortBy: 'activity', sortDir: 'asc' });
  assert.equal(result.total, 1); assert.equal(result.unfilteredTotal, 5);
  assert.equal(result.organizations[0].active_campaigns_count, 1); assert.equal(result.organizations[0].campaigns_count, 3);
  assert.match(queries[0].sql, /COUNT\(\*\) FILTER \(WHERE c.status = 'published'\)/);
  assert.match(queries[0].sql, /c.deleted_at IS NULL/); assert.match(queries[0].sql, /ORDER BY e.updated_at ASC, e.id/);
});

test('unknown sort input cannot become SQL and legacy pagination remains parameterized', async () => {
  const { api, queries } = readApi(); await api.getOrganizations({ sortBy: 'DROP TABLE', sortDir: 'anything', page: 2, limit: 25 });
  assert.match(queries[0].sql, /ORDER BY e.created_at DESC, e.id/); assert.ok(!queries[0].sql.includes('DROP TABLE'));
  assert.deepEqual(Array.from(queries[0].params.slice(-2)), [25, 50]);
});
