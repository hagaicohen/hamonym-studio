import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ENTITY_CATEGORIES } from '../../config/entity-categories';
import { CategorySuggestComponent } from './category-suggest.component';
import { PlatformCategorySuggestionsPageComponent } from '../../../modules/platform/pages/platform-category-suggestions-page/platform-category-suggestions-page.component';

const ADDED: Record<string, string> = {
  settlement: 'התיישבות', agriculture: 'חקלאות', 'youth-movements': 'תנועות נוער', 'security-rescue': 'ביטחון והצלה',
  'soldiers-reservists': 'חיילים ומילואים', 'bereaved-families': 'משפחות שכולות', 'heritage-commemoration': 'מורשת והנצחה',
  communities: 'קהילות ויישובים', 'employment-training': 'תעסוקה והכשרה מקצועית', 'immigrant-absorption': 'קליטת עלייה',
  'disabilities-accessibility': 'מוגבלויות ונגישות', 'food-security': 'מזון וביטחון תזונתי', housing: 'דיור',
  'research-development': 'מחקר ופיתוח',
};

describe('Official category list (2026-11-03 additions)', () => {
  it('adds the 14 new categories, keeps "בעלי חיים" and "סיוע לנזקקים" once, and has 46 in total', () => {
    const byId = Object.fromEntries(ENTITY_CATEGORIES.map((c) => [c.id, c.label]));
    for (const [id, label] of Object.entries(ADDED)) expect(byId[id]).withContext(id).toBe(label);
    expect(ENTITY_CATEGORIES.filter((c) => c.label === 'בעלי חיים').length).toBe(1);
    expect(byId['aid-support']).toBe('סיוע לנזקקים');
    expect(ENTITY_CATEGORIES.length).toBe(46);
    expect(new Set(ENTITY_CATEGORIES.map((c) => c.label)).size).toBe(46);
  });
});

describe('Suggest a missing category', () => {
  let fixture: ComponentFixture<CategorySuggestComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;
  const q = (s: string) => el.querySelector(s) as HTMLElement | null;
  const typeLabel = (value: string) => {
    const input = q('.hm-cat-suggest-input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CategorySuggestComponent);
    fixture.componentInstance.entityId = 'entity-a';
    el = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => { http.verify(); fixture.destroy(); });

  function open() {
    (q('.hm-cat-suggest-link') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('shows a subtle link that opens an accessible inline field and focuses it', fakeAsync(() => {
    expect(q('.hm-cat-suggest-link')!.textContent!.trim()).toBe('חסרה קטגוריה? הציעו קטגוריה חדשה');
    open();
    flush();
    const input = q('.hm-cat-suggest-input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(q(`label[for="${input.id}"]`)!.textContent).toContain('שם הקטגוריה המוצעת');
  }));

  it('sends the suggestion with the organization id on Enter and confirms it was not added automatically', fakeAsync(() => {
    open();
    typeLabel('  ספורט   ימי ');
    (q('.hm-cat-suggest-input') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/category-suggestions'));
    expect(req.request.body).toEqual({ label: 'ספורט ימי', entityId: 'entity-a' });
    expect(req.request.headers.has('Authorization')).toBeTrue();
    req.flush({ duplicate: false, suggestion: { id: 's1', label: 'ספורט ימי', status: 'pending' } });
    fixture.detectChanges();
    flush();
    expect(q('.hm-cat-suggest-done')!.textContent).toContain('לא תתווסף לרשימה באופן אוטומטי');
    expect(q('.hm-cat-suggest-input')).toBeNull();
  }));

  it('reports a duplicate pending suggestion and an existing official category clearly', fakeAsync(() => {
    open();
    typeLabel('ספורט ימי');
    (q('.hm-cat-suggest-send') as HTMLButtonElement).click();
    http.expectOne(() => true).flush({ duplicate: true, suggestion: { id: 's1', label: 'ספורט ימי', status: 'pending' } });
    fixture.detectChanges();
    flush();
    expect(q('.hm-cat-suggest-done')!.textContent).toContain('כבר נמצאת בבדיקה');

    open();
    typeLabel('דיור');
    (q('.hm-cat-suggest-send') as HTMLButtonElement).click();
    http.expectOne(() => true).flush({ error: 'x', code: 'CATEGORY_EXISTS', category: { id: 'housing', label: 'דיור' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(q('.hm-cat-suggest-error')!.textContent).toContain('„דיור” כבר קיימת ברשימה');
    expect((q('.hm-cat-suggest-input') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true');
    flush();
  }));

  it('validates the length locally and shows server errors (e.g. rate limit)', fakeAsync(() => {
    open();
    typeLabel('א');
    (q('.hm-cat-suggest-send') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('.hm-cat-suggest-error')!.textContent).toContain('לפחות 2 תווים');
    http.expectNone(() => true);

    typeLabel('קטגוריה חדשה');
    (q('.hm-cat-suggest-send') as HTMLButtonElement).click();
    http.expectOne(() => true).flush({ error: 'נשלחו הצעות רבות בזמן קצר. נסו שוב מאוחר יותר', code: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many' });
    fixture.detectChanges();
    expect(q('.hm-cat-suggest-error')!.textContent).toContain('נשלחו הצעות רבות');
    flush();
  }));

  it('works before the organization exists (no entity id sent) and Escape cancels', fakeAsync(() => {
    fixture.componentInstance.entityId = null;
    open();
    typeLabel('קטגוריה חדשה');
    (q('.hm-cat-suggest-send') as HTMLButtonElement).click();
    const req = http.expectOne(() => true);
    expect(req.request.body).toEqual({ label: 'קטגוריה חדשה' });
    req.flush({ duplicate: false, suggestion: { id: 's2', label: 'קטגוריה חדשה', status: 'pending' } });
    fixture.detectChanges();
    open();
    (q('.hm-cat-suggest-input') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    flush();
    expect(q('.hm-cat-suggest-input')).toBeNull();
    expect(document.activeElement).toBe(q('.hm-cat-suggest-link'));
  }));
});

describe('Super Admin category suggestions page', () => {
  let fixture: ComponentFixture<PlatformCategorySuggestionsPageComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;
  const q = (s: string) => el.querySelector(s) as HTMLElement | null;
  const row = (over: any = {}) => ({
    id: 's1', label: 'ספורט ימי', status: 'pending', entity_id: 'e1', entity_name: 'עמותת הים', suggested_by_name: 'דנה',
    suggested_by_email: 'dana@example.test', reviewed_by_name: null, review_note: null, created_at: '2026-11-03T10:00:00Z', reviewed_at: null, ...over,
  });
  const counts = { pending: 1, approved: 2, rejected: 0 };
  const expectList = (status: string, body: any) => {
    const req = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/platform/category-suggestions'));
    expect(req.request.params.get('status')).toBe(status);
    req.flush(body);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PlatformCategorySuggestionsPageComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => { http.verify(); fixture.destroy(); });

  it('lists pending suggestions with organization, author and status counts', () => {
    expectList('pending', { suggestions: [row()], counts });
    expect(q('.plat-table tbody')!.textContent).toContain('ספורט ימי');
    expect(q('.plat-table tbody')!.textContent).toContain('עמותת הים');
    expect(q('.plat-table tbody')!.textContent).toContain('dana@example.test');
    const chips = Array.from(el.querySelectorAll('.plat-chip')).map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
    expect(chips).toEqual(['ממתינות לבדיקה 1', 'אושרו 2', 'נדחו 0']);
  });

  it('approve asks for confirmation, sends the note, explains the official list did not change and reloads', fakeAsync(() => {
    expectList('pending', { suggestions: [row()], counts });
    (q('.cs-approve') as HTMLButtonElement).click();
    fixture.detectChanges();
    flush();
    expect(q('[role="dialog"]')!.textContent).toContain('לא תתווסף לרשימה באופן אוטומטי');
    expect(document.activeElement).toBe(q('#cs-note'));
    const note = q('#cs-note') as HTMLTextAreaElement;
    note.value = 'לשקול בגרסה הבאה';
    note.dispatchEvent(new Event('input'));
    (q('.cs-confirm') as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/platform/category-suggestions/s1/approve'));
    expect(req.request.body).toEqual({ note: 'לשקול בגרסה הבאה' });
    req.flush({ suggestion: row({ status: 'approved' }) });
    fixture.detectChanges();
    expectList('pending', { suggestions: [], counts: { pending: 0, approved: 3, rejected: 0 } });
    expect(q('[role="dialog"]')).toBeNull();
    expect(q('.cs-notice')!.textContent).toContain('הרשימה הרשמית לא השתנתה');
    expect(q('.plat-empty')!.textContent).toContain('אין הצעות שממתינות לבדיקה');
  }));

  it('reject works without a note; an already-reviewed conflict is shown and the list refreshes', fakeAsync(() => {
    expectList('pending', { suggestions: [row()], counts });
    (q('.cs-reject') as HTMLButtonElement).click();
    fixture.detectChanges();
    flush();
    (q('.cs-confirm') as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.url.endsWith('/s1/reject'));
    expect(req.request.body).toEqual({});
    req.flush({ error: 'ההצעה כבר טופלה', code: 'ALREADY_REVIEWED' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(q('.cs-dialog-error')!.textContent).toContain('ההצעה כבר טופלה');
    expectList('pending', { suggestions: [], counts });
  }));

  it('switching to reviewed suggestions shows decision notes instead of actions', () => {
    expectList('pending', { suggestions: [row()], counts });
    (el.querySelectorAll('.plat-chip')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expectList('approved', { suggestions: [row({ status: 'approved', review_note: 'נוסיף ברבעון הבא', reviewed_at: '2026-11-03T12:00:00Z', reviewed_by_name: 'מנהל' })], counts });
    expect(q('.cs-approve')).toBeNull();
    expect(q('.plat-table tbody')!.textContent).toContain('נוסיף ברבעון הבא');
    expect(q('.plat-status')!.textContent).toContain('אושרה');
  });
});
