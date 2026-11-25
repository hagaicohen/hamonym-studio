import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CampaignBlock, CampaignDraft, CampaignStudioStateService } from '../services/campaign-studio-state.service';
import { CampaignApiService } from '../services/campaign-api.service';
import { environment } from '../../../../environments/environment';
import {
  canonicalDraft, copyBlockTranslations, getAt, keepHebrewAsEnglish, localizeDraft, missingHebrew, missingTranslations,
  normalizeContentI18n, projectToLanguage, publicLanguages, setAt, syncContentView, translatableFields, withEnglishPublished,
} from './content-i18n';

// Bilingual campaign content (docs/BILINGUAL-I18N-ROADMAP.md, D-38 … D-45):
// one campaign, Hebrew in the regular fields, English as an overlay by path.

const block = (id: string, type: CampaignBlock['type'], data: any, extra: Partial<CampaignBlock> = {}): CampaignBlock =>
  ({ id, type, order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data, ...extra }) as CampaignBlock;

function baseDraft(): CampaignDraft {
  // The service has no dependencies; a fresh instance gives the default new draft.
  const d = structuredClone(new CampaignStudioStateService().draft);
  d.title = 'קמפיין לדוגמה';
  d.shortDescription = 'תיאור בעברית';
  d.managerName = 'דנה';
  d.blocks = [
    block('b-story', 'rich-text', { content: '<p>הסיפור שלנו</p>' }, { label: 'הסיפור', order: 0 }),
    block('b-donate', 'donation-widget', { title: 'תמכו', subtitle: 'כל תרומה עוזרת', ctaLabel: 'תרמו עכשיו', ctaIcon: '', ctaColor: '#111', showSecurityBadge: true, showPaymentLogos: false, paymentLogos: [] }, { order: 1 }),
    block('b-gallery', 'gallery', { items: [{ url: 'a.jpg', caption: 'תמונה א' }], style: 'grid', aspectRatio: '1:1', showCaptions: true, showDots: false, showArrows: false, autoPlay: false }, { order: 2, label: 'גלריה' }),
    block('b-stats', 'stats', { items: [], style: 'cards', size: 'md', iconColor: '', backgroundColor: '', borderColor: '', borderRadius: 0 }, { order: 3, label: 'פס נתונים' }),
  ];
  d.offerings = [{ id: 'o1', title: 'ספל', description: 'ספל ממותג', minimumAmount: 100, stock: null, imageUrl: null }];
  d.offeringsEnabled = true;
  d.blocks.push(block('b-rewards', 'rewards', {}, { order: 4 }));
  return d;
}

describe('content-i18n — content paths', () => {
  it('lists the authored text fields, never styling or settings', () => {
    const paths = translatableFields(baseDraft()).map(f => f.path);
    expect(paths).toContain('title');
    expect(paths).toContain('blocks#b-story.data.content');
    expect(paths).toContain('blocks#b-story.label');
    expect(paths).toContain('blocks#b-donate.data.ctaLabel');
    expect(paths).toContain('blocks#b-gallery.data.items.0.caption');
    expect(paths).toContain('offerings#o1.title');
    // A label shown only in the editor tree, colors and amounts are not content.
    expect(paths).not.toContain('blocks#b-stats.label');
    expect(paths.some(p => /ctaColor|minimumAmount|targetAmount|slug/.test(p))).toBeFalse();
  });

  it('reads and writes by block id, not by position', () => {
    const d = baseDraft();
    expect(getAt(d, 'blocks#b-donate.data.title')).toBe('תמכו');
    expect(setAt(d, 'blocks#b-donate.data.title', 'Support')).toBeTrue();
    expect((d.blocks[1].data as any).title).toBe('Support');
    expect(setAt(d, 'blocks#missing.data.title', 'x')).toBeFalse();
  });
});

describe('content-i18n — rendering a language', () => {
  it('Hebrew is the draft itself; an untranslated campaign is untouched', () => {
    const d = baseDraft();
    expect(canonicalDraft(d)).toBe(d);
    expect(localizeDraft(d, 'he')).toBe(d);
  });

  it('English replaces translated fields and keeps everything else shared', () => {
    const d = baseDraft();
    d.contentI18n = { v: 1, en: { published: false, values: { title: 'Sample campaign', 'blocks#b-story.data.content': '<p>Our story</p>' } } };
    const en = localizeDraft(d, 'en');
    expect(en.title).toBe('Sample campaign');
    expect((en.blocks[0].data as any).content).toBe('<p>Our story</p>');
    expect(en.shortDescription).toBe('תיאור בעברית', 'fallback keeps the Hebrew');
    expect(localizeDraft(d, 'en', { fallback: false }).shortDescription).toBe('');
    expect(en.blocks.map(b => b.id)).toEqual(d.blocks.map(b => b.id));
    expect(en.targetAmount).toBe(d.targetAmount);
    expect(en.layout.theme).toEqual(d.layout.theme);
    expect(d.title).toBe('קמפיין לדוגמה', 'the source draft is not modified');
  });
});

describe('content-i18n — editing the English version', () => {
  it('edits made in English are stored as English; Hebrew stays exactly as it was', () => {
    const view = projectToLanguage(baseDraft(), 'en');
    expect(view.title).toBe('קמפיין לדוגמה', 'missing English shows the Hebrew');
    view.title = 'Sample campaign';
    (view.blocks[1].data as any).ctaLabel = 'Donate now';
    (view.blocks[1].data as any).ctaColor = '#ff0000';
    const saved = canonicalDraft(view);
    expect(saved.title).toBe('קמפיין לדוגמה');
    expect((saved.blocks[1].data as any).ctaLabel).toBe('תרמו עכשיו');
    expect((saved.blocks[1].data as any).ctaColor).toBe('#ff0000', 'styling edited in English is shared');
    expect(saved.contentI18n!.en!.values).toEqual({ title: 'Sample campaign', 'blocks#b-donate.data.ctaLabel': 'Donate now' });
    expect(saved.contentView).toBeUndefined();
  });

  it('never copies Hebrew into English for fields that were not edited', () => {
    const view = projectToLanguage(baseDraft(), 'en');
    const saved = canonicalDraft(view);
    expect(saved.contentI18n).toBeUndefined();
    expect(missingTranslations(saved).length).toBeGreaterThan(0);
  });

  it('keeps existing English when the Hebrew version is edited', () => {
    const d = baseDraft();
    d.contentI18n = { v: 1, en: { published: true, values: { title: 'Sample campaign' } } };
    d.title = 'שם חדש';
    const saved = canonicalDraft(d);
    expect(saved.title).toBe('שם חדש');
    expect(saved.contentI18n!.en!.values['title']).toBe('Sample campaign');
    expect(saved.contentI18n!.en!.published).toBeTrue();
  });

  it('round-trips through both languages without losing either', () => {
    let d = baseDraft();
    let view = projectToLanguage(d, 'en');
    view.shortDescription = 'English description';
    d = projectToLanguage(view, 'he');
    expect(d.shortDescription).toBe('תיאור בעברית');
    view = projectToLanguage(d, 'en');
    expect(view.shortDescription).toBe('English description');
  });

  it('a block added while English is open starts with its Hebrew seed and no English', () => {
    let view = projectToLanguage(baseDraft(), 'en');
    view = syncContentView({ ...view, blocks: [...view.blocks, block('b-new', 'rich-text', { content: '<p>טקסט חדש</p>' }, { order: 9, label: 'טקסט' })] });
    let saved = canonicalDraft(view);
    expect((saved.blocks.find(b => b.id === 'b-new')!.data as any).content).toBe('<p>טקסט חדש</p>');
    expect(saved.contentI18n?.en?.values?.['blocks#b-new.data.content']).toBeUndefined();
    (view.blocks.find(b => b.id === 'b-new')!.data as any).content = '<p>New text</p>';
    saved = canonicalDraft(view);
    expect(saved.contentI18n!.en!.values['blocks#b-new.data.content']).toBe('<p>New text</p>');
    expect((saved.blocks.find(b => b.id === 'b-new')!.data as any).content).toBe('<p>טקסט חדש</p>');
  });

  it('an item created in English has no Hebrew yet and is reported as missing in Hebrew', () => {
    let view = projectToLanguage(baseDraft(), 'en');
    view = syncContentView({ ...view, offerings: [...view.offerings, { id: 'o2', title: '', description: '', minimumAmount: 50, stock: null, imageUrl: null }] });
    view.offerings[1].title = 'T-shirt';
    expect(missingHebrew(view).map(m => m.path)).toContain('offerings#o2.title');
    const saved = canonicalDraft(view);
    expect(saved.offerings[1].title).toBe('');
    expect(saved.contentI18n!.en!.values['offerings#o2.title']).toBe('T-shirt');
  });

  it('drops the translations of deleted content and keeps the rest', () => {
    const d = baseDraft();
    d.contentI18n = { v: 1, en: { published: false, values: { 'blocks#b-story.data.content': 'x', 'offerings#o1.title': 'Mug', 'blocks#gone.data.content': 'y' } } };
    d.blocks = d.blocks.filter(b => b.id !== 'b-story');
    const values = canonicalDraft(d).contentI18n!.en!.values;
    expect(values).toEqual({ 'offerings#o1.title': 'Mug' });
  });

  it('a duplicated block carries its translations', () => {
    const d = baseDraft();
    d.contentI18n = { v: 1, en: { published: false, values: { 'blocks#b-story.data.content': '<p>Our story</p>' } } };
    const copy = { ...d.blocks[0], id: 'b-copy' };
    const out = copyBlockTranslations({ ...d, blocks: [...d.blocks, copy] }, new Map([['b-story', 'b-copy']]));
    expect(out.contentI18n!.en!.values['blocks#b-copy.data.content']).toBe('<p>Our story</p>');
  });
});

describe('content-i18n — registration options keep their translations', () => {
  it('attaches English to the option identity, so reordering and inserting never move it', () => {
    const d = baseDraft();
    d.registrationOptions = [
      { id: '1', uid: 'roA', key: 'R5', title: '5 ק"מ', description: '', price: 50 },
      { id: '2', uid: 'roB', key: 'R10', title: '10 ק"מ', description: '', price: 80 },
    ];
    d.contentI18n = { v: 1, en: { published: false, values: { 'registrationOptions#roB.title': '10 km' } } };
    // Reordered and a new option inserted in front (the server also re-creates ids on save).
    d.registrationOptions = [
      { id: '9', uid: 'roNew', key: '', title: 'חדש', description: '', price: 10 },
      { ...d.registrationOptions[1], id: '7' },
      { ...d.registrationOptions[0], id: '8' },
    ];
    const en = localizeDraft(d, 'en');
    expect(en.registrationOptions.map(o => o.title)).toEqual(['חדש', '10 km', '5 ק"מ']);
    // Removing the option drops its translation.
    d.registrationOptions = d.registrationOptions.filter(o => o.uid !== 'roB');
    expect(canonicalDraft(d).contentI18n!.en!.values['registrationOptions#roB.title']).toBeUndefined();
  });
});

describe('content-i18n — completeness and publishing', () => {
  const complete = () => {
    const d = baseDraft();
    const values: Record<string, string> = {};
    for (const m of missingTranslations(d)) values[m.path] = `EN ${m.path}`;
    d.contentI18n = { v: 1, en: { published: false, values } };
    return d;
  };

  it('counts only visible fields that have Hebrew text', () => {
    const d = baseDraft();
    d.heroCtaConfig = { ...d.heroCtaConfig, visible: false, label: 'תמכו' };
    d.blocks[0].visible = false;
    const paths = missingTranslations(d).map(m => m.path);
    expect(paths).not.toContain('heroCtaConfig.label');
    expect(paths).not.toContain('blocks#b-story.data.content');
    expect(paths).toContain('title');
  });

  it('English reaches the public only when published and complete', () => {
    const d = complete();
    expect(missingTranslations(d)).toEqual([]);
    expect(publicLanguages(d)).toEqual(['he']);
    const published = withEnglishPublished(d, true);
    expect(publicLanguages(published)).toEqual(['he', 'en']);
    // New Hebrew content without English hides the English version again.
    published.blocks.push(block('b-late', 'rich-text', { content: '<p>חדש</p>' }, { order: 8 }));
    expect(publicLanguages(published)).toEqual(['he']);
  });

  it('"same in both" stores the manager\'s own Hebrew text, nothing invented', () => {
    const d = keepHebrewAsEnglish(baseDraft(), 'managerName');
    expect(d.contentI18n!.en!.values['managerName']).toBe('דנה');
    expect(missingTranslations(d).map(m => m.path)).not.toContain('managerName');
  });

  it('normalizes what the server sends', () => {
    expect(normalizeContentI18n(null)).toBeUndefined();
    expect(normalizeContentI18n({ v: 1 })).toEqual({ v: 1 });
    expect(normalizeContentI18n({ v: 1, en: { published: 'yes', values: { title: 'T', bad: 5 } } }))
      .toEqual({ v: 1, en: { published: false, values: { title: 'T' } } });
  });
});

describe('content-i18n — state service and API', () => {
  let state: CampaignStudioStateService;
  let api: CampaignApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    state = TestBed.inject(CampaignStudioStateService);
    api = TestBed.inject(CampaignApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('switching the content language is not an unsaved change', () => {
    const d = baseDraft();
    state.loadDraft(d);
    state.setContentLanguage('en');
    expect(state.contentLanguage).toBe('en');
    expect(state.hasUnsavedChanges()).toBeFalse();
    state.patch({ title: 'Sample campaign' });
    expect(state.hasUnsavedChanges()).toBeTrue();
    state.setContentLanguage('he');
    expect(state.draft.title).toBe('קמפיין לדוגמה');
    expect(state.draft.contentI18n!.en!.values['title']).toBe('Sample campaign');
  });

  it('saves Hebrew in the columns and English in content_i18n while English is open', () => {
    const d = { ...baseDraft(), id: 'c1' };
    state.loadDraft(d);
    state.setContentLanguage('en');
    state.patch({ title: 'Sample campaign' });
    api.update('c1', state.draft).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/api/campaigns/c1`);
    expect(req.request.body.title).toBe('קמפיין לדוגמה');
    expect(req.request.body.content_i18n).toEqual({ v: 1, en: { published: false, values: { title: 'Sample campaign' } } });
    expect(req.request.body.contentView).toBeUndefined();
    req.flush({ id: 'c1' });
    expect(state.hasUnsavedChanges()).toBeFalse();
  });

  it('an untranslated campaign is saved exactly as before (no content_i18n)', () => {
    const d = { ...baseDraft(), id: 'c1' };
    api.update('c1', d).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/api/campaigns/c1`);
    expect('content_i18n' in req.request.body).toBeFalse();
    req.flush({ id: 'c1' });
  });

  it('loads content_i18n from the server', () => {
    api.getById('c1').subscribe(d => {
      expect(d.contentI18n).toEqual({ v: 1, en: { published: true, values: { title: 'T' } } });
    });
    http.expectOne(`${environment.apiUrl}/api/campaigns/c1`).flush({ id: 'c1', title: 'ט', content_i18n: { v: 1, en: { published: true, values: { title: 'T' } } } });
  });

  it('duplicating a block in English keeps the copy translated', () => {
    const d = baseDraft();
    d.contentI18n = { v: 1, en: { published: false, values: { 'blocks#b-story.data.content': '<p>Our story</p>' } } };
    state.loadDraft(d);
    const id = state.duplicateBlock('b-story', [])!;
    expect(state.draft.contentI18n!.en!.values[`blocks#${id}.data.content`]).toBe('<p>Our story</p>');
  });

  it('payments keep the stored (Hebrew) offering title on an English page', () => {
    const d = baseDraft();
    d.contentI18n = { v: 1, en: { published: true, values: { 'offerings#o1.title': 'Mug' } } };
    state.loadDraft(localizeDraft(d, 'en'));
    state.setStoredVersion(d);
    expect(state.draft.offerings[0].title).toBe('Mug');
    expect(state.storedOfferingTitle('o1')).toBe('ספל');
  });
});
