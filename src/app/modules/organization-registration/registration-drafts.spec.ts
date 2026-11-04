import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { OrganizationRegistrationComponent } from './pages/organization-registration/organization-registration.component';
import { OrganizationRegistrationStateService } from './services/organization-registration-state.service';
import { StepEntityComponent } from './components/step-entity/step-entity.component';

const draft = (id: string, name: string, updated: string) =>
  ({ id, legal_name: name, entity_type: 'association', registration_number: `58${id}`, status: 'draft', updated_at: updated });

describe('Registration drafts panel', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<OrganizationRegistrationComponent>;
  let el: HTMLElement;
  let opened: any[] = [];
  let query: Record<string, string> = {};
  // Resume loads the draft by id; answer those loads with the listed draft.
  const isLoad = (r: any) => r.method === 'GET' && /\/api\/entities\/(?!my$)[^/]+$/.test(r.url);
  const flushLoads = () => {
    for (const req of http.match(isLoad)) req.flush(opened.find((d) => req.request.url.endsWith('/' + d.id)));
  };
  const render = () => { fixture.detectChanges(); flushLoads(); fixture.detectChanges(); };
  const names = () => Array.from(el.querySelectorAll('.draft-name')).map((n) => n.textContent!.trim());
  const rows = () => Array.from(el.querySelectorAll('.draft-row')) as HTMLElement[];
  const row = (name: string) => rows().find((r) => r.querySelector('.draft-name')!.textContent!.trim() === name)!;
  const click = (root: Element, sel: string) => { (root.querySelector(sel) as HTMLButtonElement).click(); render(); };
  const service = () => fixture.debugElement.injector.get(OrganizationRegistrationStateService);
  const state = () => service().state();
  const edit = (patch: any) => { service().updateState(patch); render(); };
  const dialog = (sel: string) => el.querySelector(sel) as HTMLDialogElement;

  function open(entities: any[]) {
    opened = entities;
    fixture = TestBed.createComponent(OrganizationRegistrationComponent);
    el = fixture.nativeElement;
    render();
    http.expectOne((r) => r.url.endsWith('/api/entities/my')).flush({ entities });
    render();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return convertToParamMap(query); } } } }] });
    TestBed.overrideComponent(StepEntityComponent, { set: { template: '' } });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { fixture?.destroy(); http.verify(); query = {}; });

  it('"השלם רישום" (?draft=<id>) opens exactly that draft, loaded by id', () => {
    query = { draft: 'b' };
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z'), draft('b', 'שנייה', '2026-11-02T10:00:00Z')]);
    expect(state().entityId).toBe('b');
    expect(state().organizationName).toBe('שנייה');
    expect(row('שנייה').classList.contains('is-current')).toBeTrue();
    expect(fixture.componentInstance.isDirty()).toBeFalse();
  });

  it('a ?draft link to an unknown or submitted registration opens nothing and explains why', () => {
    query = { draft: 'gone' };
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z')]);
    expect(state().entityId).toBeNull();
    http.expectNone((r) => r.url.endsWith('/api/entities/gone'));
    expect(el.querySelector('.draft-save-status--error')!.textContent).toContain('הטיוטה המבוקשת לא נמצאה');
  });

  it('lists only saved drafts, newest first, each with three icon actions', () => {
    open([
      draft('a', 'עמותת אור חדש', '2026-11-02T10:00:00Z'),
      { id: 'x', legal_name: 'Active', status: 'active', updated_at: '2026-11-04T10:00:00Z' },
      draft('b', 'עמותת אלעד', '2026-11-03T10:00:00Z'),
    ]);
    // The new, never-saved registration is not a row.
    expect(names()).toEqual(['עמותת אלעד', 'עמותת אור חדש']);
    expect(el.querySelector('.drafts-count')!.textContent!.trim()).toBe('2 טיוטות');
    const btn = (r: Element, sel: string) => r.querySelector(sel) as HTMLButtonElement;
    expect(el.querySelector('.draft-badge')).toBeNull();
    expect(el.textContent).not.toContain('בעריכה');
    expect(el.querySelectorAll('.draft-row.is-current').length).toBe(0);
    const other = row('עמותת אלעד');
    expect(Array.from(other.querySelectorAll('.draft-actions button')).map((b) => b.getAttribute('title'))).toEqual(['מחק טיוטה', 'המשך עריכה', 'ניתן לשמור רק את הטיוטה שבעריכה']);
    expect(other.querySelectorAll('.draft-actions button lucide-icon').length).toBe(3);
    expect(other.querySelector('.draft-actions')!.textContent!.trim()).toBe('');
    expect(btn(other, '.draft-save-btn').disabled).toBeTrue();
    expect(btn(other, '.draft-resume-btn').disabled).toBeFalse();
    expect(btn(other, '.draft-delete-btn').disabled).toBeFalse();
    expect(other.querySelector('.draft-date')!.textContent!.trim()).toBe('03/11/2026');
    expect(el.querySelector('.save-draft-btn, .draft-save-bar')).toBeNull();

    click(other, '.draft-resume-btn');
    const current = el.querySelector('.draft-row.is-current')!;
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(btn(current, '.draft-resume-btn').disabled).toBeTrue();
    expect(btn(current, '.draft-save-btn').disabled).toBeTrue();
    expect(btn(current, '.draft-save-btn').title).toBe('אין שינויים לשמירה');
    edit({ organizationName: 'עמותת אלעד 2' });
    expect(btn(current, '.draft-save-btn').disabled).toBeFalse();
    expect(btn(current, '.draft-save-btn').title).toBe('שמור שינויים');
  });

  it('many drafts scroll inside ~170px; "new registration" stays below the list', () => {
    open([1, 2, 3, 4, 5].map((n) => draft(`d${n}`, `עמותה ${n}`, `2026-11-0${n}T10:00:00Z`)));
    const list = el.querySelector('.drafts-list') as HTMLElement;
    expect(getComputedStyle(list).maxHeight).toBe('170px');
    expect(getComputedStyle(list).overflowY).toBe('auto');
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    const footer = el.querySelector('.draft-new-btn') as HTMLElement;
    expect(list.contains(footer)).toBeFalse();
    click(rows()[0], '.draft-resume-btn');
    expect(el.querySelector('.draft-new-btn')!.textContent!.trim()).toBe('התחלת הרשמה חדשה');
  });

  it('a new registration joins the list as "בעריכה" once it has a name and number', () => {
    open([draft('a', 'קיימת', '2026-11-03T10:00:00Z')]);
    expect((el.querySelector('.draft-new-btn') as HTMLButtonElement).disabled).toBeTrue();
    edit({ organizationName: 'חדשה' });
    expect(names()).toEqual(['קיימת']);
    edit({ organizationNumber: '580000001' });
    expect(names()).toEqual(['חדשה', 'קיימת']);
    const fresh = rows()[0];
    expect(fresh.querySelector('.draft-badge')!.textContent!.trim()).toBe('בעריכה');
    expect(fresh.classList.contains('is-current')).toBeTrue();
    expect(fresh.querySelector('.draft-date')!.textContent).toContain('טרם נשמרה');
    expect((fresh.querySelector('.draft-resume-btn') as HTMLButtonElement).disabled).toBeTrue();
    expect(el.querySelectorAll('.draft-badge').length).toBe(1);
    // No loading spinner or highlight on a row that is not loading (its id is null too).
    expect(fresh.querySelector('.draft-spinner')).toBeNull();
    expect(fresh.classList.contains('is-loading')).toBeFalse();
    expect(el.querySelector('.draft-loading')).toBeNull();
    expect(fresh.querySelector('.draft-unsaved')).toBeNull();
    expect(fresh.querySelector('lucide-icon')).toBeTruthy();
    expect(el.querySelector('.drafts-count')!.textContent!.trim()).toBe('1 טיוטה');
  });

  it('leaving an unsaved new registration asks to save; declining deletes it (nothing sent)', () => {
    open([draft('a', 'קיימת', '2026-11-03T10:00:00Z')]);
    edit({ entityType: 'association', organizationName: 'חדשה', organizationNumber: '580000001' });
    click(row('קיימת'), '.draft-resume-btn');
    const sw = dialog('dialog[aria-labelledby="switch-dialog-title"]');
    expect(sw.open).toBeTrue();
    expect(sw.textContent).toContain('לשמור את הטיוטה החדשה?');
    expect(sw.textContent).toContain('היא תימחק');
    const discard = Array.from(sw.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'מחק טיוטה') as HTMLButtonElement;
    discard.click(); render();
    expect(state().entityId).toBe('a');
    expect(names()).toEqual(['קיימת']);
    http.expectNone((r) => r.method === 'POST' || r.method === 'DELETE');
  });

  it('leaving an unsaved new registration and choosing save creates it, then switches', () => {
    open([draft('a', 'קיימת', '2026-11-03T10:00:00Z')]);
    edit({ entityType: 'association', organizationName: 'חדשה', organizationNumber: '580000001' });
    click(row('קיימת'), '.draft-resume-btn');
    click(el, '.draft-dialog-primary');
    http.expectOne((r) => r.method === 'POST').flush({ entity: { id: 'new', legal_name: 'חדשה', status: 'draft', updated_at: '2026-11-04T09:00:00Z' } });
    render();
    expect(state().entityId).toBe('a');
    expect(names()).toEqual(['חדשה', 'קיימת']);
  });

  it('the trash icon on an unsaved new registration discards it locally', () => {
    open([]);
    edit({ entityType: 'association', organizationName: 'חדשה', organizationNumber: '580000001' });
    click(rows()[0], '.draft-delete-btn');
    click(el, '.draft-dialog-confirm');
    expect(state().organizationName).toBe('');
    expect(names()).toEqual([]);
    http.expectNone((r) => r.method === 'DELETE');
  });

  it('first save of a new registration creates exactly one entity; later saves update it', () => {
    open([draft('a', 'קיימת', '2026-11-03T10:00:00Z')]);
    edit({ entityType: 'association', organizationName: 'חדשה', organizationNumber: '580000001' });
    const save = () => rows()[0].querySelector('.draft-save-btn') as HTMLButtonElement;
    expect(save().disabled).toBeFalse();
    save().click(); render();
    save().click();
    fixture.componentInstance.saveDraft();
    const create = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/entities'));
    create.flush({ entity: { id: 'new', legal_name: 'חדשה', status: 'draft', updated_at: '2026-11-04T09:00:00Z' } });
    render();
    expect(state().entityId).toBe('new');
    expect(names()).toEqual(['חדשה', 'קיימת']);
    expect(rows()[0].classList.contains('is-current')).toBeTrue();
    expect(rows()[0].querySelector('.draft-unsaved')).toBeNull();
    expect((rows()[0].querySelector('.draft-save-btn') as HTMLButtonElement).disabled).toBeTrue();
    expect(el.querySelector('.drafts-count')!.textContent!.trim()).toBe('2 טיוטות');

    edit({ organizationName: 'חדשה 2' });
    click(rows()[0], '.draft-save-btn');
    http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/entities/new')).flush({ id: 'new', status: 'draft' });
    http.expectNone((r) => r.method === 'POST');
  });

  it('resume loads exactly the chosen draft; saving then targets that id only', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z'), draft('b', 'שנייה', '2026-11-02T10:00:00Z')]);
    click(row('שנייה'), '.draft-resume-btn');
    expect(state().entityId).toBe('b');
    expect(state().organizationName).toBe('שנייה');
    expect(row('שנייה').classList.contains('is-current')).toBeTrue();
    expect((row('שנייה').querySelector('.draft-save-btn') as HTMLButtonElement).disabled).toBeTrue();
    expect((row('ראשונה').querySelector('.draft-resume-btn') as HTMLButtonElement).disabled).toBeFalse();
    expect(names()).not.toContain('הרשמה חדשה');

    edit({ organizationName: 'שנייה מעודכנת' });
    expect((row('ראשונה').querySelector('.draft-save-btn') as HTMLButtonElement).disabled).toBeTrue();
    click(el.querySelector('.draft-row.is-current')!, '.draft-save-btn');
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.url).toMatch(/\/api\/entities\/b$/);
    expect(req.request.body.legal_name).toBe('שנייה מעודכנת');
    req.flush({ id: 'b', status: 'draft' });
  });

  it('switching drafts resets the previous one first (nothing leaks between drafts)', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z'), draft('b', 'שנייה', '2026-11-02T10:00:00Z')]);
    click(row('ראשונה'), '.draft-resume-btn');
    // A field the second draft does not carry; a stale copy would be saved into it.
    service().updateState({ terminalNumber: '1234' });
    fixture.componentInstance['markClean']();
    click(row('שנייה'), '.draft-resume-btn');
    expect(state().entityId).toBe('b');
    expect(state().terminalNumber).toBe('');
  });

  it('switching with unsaved changes asks first: cancel keeps everything, discard switches', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z'), draft('b', 'שנייה', '2026-11-02T10:00:00Z')]);
    click(row('ראשונה'), '.draft-resume-btn');
    edit({ organizationName: 'ראשונה עם שינוי' });
    click(row('שנייה'), '.draft-resume-btn');
    expect(dialog('dialog.draft-dialog[aria-labelledby="switch-dialog-title"]').open).toBeTrue();
    expect(state().entityId).toBe('a');

    click(el, '[aria-labelledby="switch-dialog-title"] .draft-dialog-cancel');
    expect(state().entityId).toBe('a');
    expect(state().organizationName).toBe('ראשונה עם שינוי');

    click(row('שנייה'), '.draft-resume-btn');
    const discard = Array.from(el.querySelectorAll('[aria-labelledby="switch-dialog-title"] button')).find((b) => b.textContent!.includes('עבור בלי לשמור')) as HTMLButtonElement;
    discard.click(); render();
    expect(state().entityId).toBe('b');
    http.expectNone((r) => r.method === 'PATCH' || r.method === 'POST');
  });

  it('"save and switch" saves the open draft to its own id, then opens the other', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z'), draft('b', 'שנייה', '2026-11-02T10:00:00Z')]);
    click(row('ראשונה'), '.draft-resume-btn');
    edit({ organizationName: 'ראשונה מעודכנת' });
    click(row('שנייה'), '.draft-resume-btn');
    click(el, '.draft-dialog-primary');
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.url).toMatch(/\/api\/entities\/a$/);
    req.flush({ id: 'a', legal_name: 'ראשונה מעודכנת', status: 'draft' });
    render();
    expect(state().entityId).toBe('b');
    expect(state().organizationName).toBe('שנייה');
  });

  it('new registration from a resumed draft starts empty; the footer turns back into first-save', () => {
    open([draft('a', 'קיימת', '2026-11-03T10:00:00Z')]);
    click(row('קיימת'), '.draft-resume-btn');
    click(el, '.draft-new-btn');
    expect(state().entityId).toBeNull();
    expect(state().organizationName).toBe('');
    expect(names()).toEqual(['קיימת']);
    expect((el.querySelector('.draft-new-btn') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('actions are blocked while a save is in flight (no switch onto a pending id)', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z')]);
    edit({ entityType: 'association', organizationName: 'חדשה', organizationNumber: '580000009' });
    click(rows()[0], '.draft-save-btn');
    expect((row('ראשונה').querySelector('.draft-resume-btn') as HTMLButtonElement).disabled).toBeTrue();
    fixture.componentInstance.resumeDraft('a');
    expect(state().entityId).toBeNull();
    http.expectOne((r) => r.method === 'POST').flush({ entity: { id: 'new', status: 'draft' } });
    render();
    expect(state().entityId).toBe('new');
  });

  it('delete asks for confirmation, uses the dedicated endpoint and updates the list in place', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z'), draft('b', 'שנייה', '2026-11-02T10:00:00Z')]);
    click(row('ראשונה'), '.draft-delete-btn');
    const del = dialog('dialog[aria-labelledby="draft-dialog-title"]');
    expect(del.open).toBeTrue();
    expect(del.textContent).toContain('ראשונה');
    click(del, '.draft-dialog-cancel');
    expect(del.open).toBeFalse();
    http.expectNone((r) => r.method === 'DELETE');

    click(row('ראשונה'), '.draft-delete-btn');
    click(del, '.draft-dialog-confirm');
    const req = http.expectOne((r) => r.method === 'DELETE');
    expect(req.request.url).toMatch(/\/api\/entities\/a\/draft-registration$/);
    req.flush({ success: true });
    render();
    expect(names()).toEqual(['שנייה']);
    expect(el.querySelector('.drafts-count')!.textContent!.trim()).toBe('1 טיוטה');
  });

  it('deleting the draft being edited returns to a new registration (never saves into it)', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z')]);
    click(row('ראשונה'), '.draft-resume-btn');
    click(row('ראשונה'), '.draft-delete-btn');
    click(el, '.draft-dialog-confirm');
    http.expectOne((r) => r.method === 'DELETE').flush({ success: true });
    render();
    expect(state().entityId).toBeNull();
    expect(names()).toEqual([]);
  });

  it('a refused delete keeps the draft and shows the reason in the dialog', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z')]);
    click(row('ראשונה'), '.draft-delete-btn');
    click(el, '.draft-dialog-confirm');
    http.expectOne((r) => r.method === 'DELETE').flush({ code: 'DRAFT_HAS_CAMPAIGNS' }, { status: 409, statusText: 'Conflict' });
    render();
    expect(dialog('dialog[aria-labelledby="draft-dialog-title"]').open).toBeTrue();
    expect(el.querySelector('.draft-dialog-error')!.textContent).toContain('קמפיינים');
    expect(names()).toContain('ראשונה');
  });

  it('switching shows a loading state, locks the form and loads the draft fresh by id', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z'), draft('b', 'שנייה', '2026-11-02T10:00:00Z')]);
    (row('שנייה').querySelector('.draft-resume-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    const req = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/entities/b'));
    expect(el.querySelector('.draft-loading')!.textContent).toContain('טוען את הטיוטה "שנייה"');
    expect(row('שנייה').classList.contains('is-loading')).toBeTrue();
    expect(row('שנייה').querySelector('.draft-spinner')).toBeTruthy();
    const steps = el.querySelector('.wizard-steps') as HTMLElement;
    expect(steps.hasAttribute('inert')).toBeTrue();
    expect(steps.getAttribute('aria-busy')).toBe('true');
    expect((row('ראשונה').querySelector('.draft-resume-btn') as HTMLButtonElement).disabled).toBeTrue();
    expect(state().entityId).toBeNull();

    req.flush({ ...draft('b', 'שנייה (מהשרת)', '2026-11-04T08:00:00Z'), contact_full_name: 'בעלים' });
    fixture.detectChanges();
    expect(el.querySelector('.draft-loading')).toBeNull();
    expect(steps.hasAttribute('inert')).toBeFalse();
    expect(state().entityId).toBe('b');
    expect(state().organizationName).toBe('שנייה (מהשרת)');
    expect(state().fullName).toBe('בעלים');
    expect(names()).toContain('שנייה (מהשרת)');
  });

  it('a failed load keeps the open registration unchanged and shows an error', () => {
    open([draft('a', 'ראשונה', '2026-11-03T10:00:00Z'), draft('b', 'שנייה', '2026-11-02T10:00:00Z')]);
    click(row('ראשונה'), '.draft-resume-btn');
    (row('שנייה').querySelector('.draft-resume-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/api/entities/b')).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(state().entityId).toBe('a');
    expect(state().organizationName).toBe('ראשונה');
    expect(el.querySelector('.draft-loading')).toBeNull();
    expect(el.querySelector('.draft-save-status--error')!.textContent).toContain('טעינת הטיוטה נכשלה');
  });

  it('fits a phone width without horizontal overflow', () => {
    open([draft('a', 'עמותה עם שם ארוך מאוד שלא נגמר אף פעם בכלל', '2026-11-03T10:00:00Z')]);
    const card = el.querySelector('.drafts-card') as HTMLElement;
    card.style.width = '343px';
    expect(card.scrollWidth).toBeLessThanOrEqual(343);
  });
});
