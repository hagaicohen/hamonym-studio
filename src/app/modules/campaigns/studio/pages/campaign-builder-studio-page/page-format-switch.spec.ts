import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CampaignBuilderStudioPageComponent } from './campaign-builder-studio-page.component';
import { CampaignBlock, CampaignDraft, CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { CAMPAIGN_TEMPLATES, TEMPLATE_PALETTES } from '../../../builder/templates/campaign-templates';

// The quick donation page is one of the Studio's templates: chosen from the
// same "תבנית" gallery as every regular template, on the same campaign.

const blocks = (): CampaignBlock[] => [
  { id: 'hero-1', type: 'hero', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} as any },
  { id: 'story-1', type: 'rich-text', order: 1, visible: true, label: 'סיפור', spacingTop: 0, spacingBottom: 0, data: { content: '<p>הסיפור שלנו</p>' } as any },
  { id: 'video-1', type: 'video', order: 2, visible: false, label: 'סרטון', spacingTop: 8, spacingBottom: 4, data: { url: 'https://youtu.be/x' } as any },
];

const blue = TEMPLATE_PALETTES.find(p => p.id === 'blue')!;
const designed = (d: CampaignDraft): Partial<CampaignDraft> => ({
  coverImageUrl: 'https://example.com/hero.jpg', heroType: 'image',
  heroTextStyle: { ...d.heroTextStyle, titleColor: '#ff0000', titleAlign: 'left' },
  layout: { ...d.layout, layoutMode: 'standard', templateId: 'classic', theme: { ...d.layout.theme, primaryColor: '#123456' } },
});

async function setup(overrides: (d: CampaignDraft) => Partial<CampaignDraft> = designed) {
  const api = { getById: jasmine.createSpy('getById'), update: jasmine.createSpy('update'), create: jasmine.createSpy('create') };
  await TestBed.configureTestingModule({
    imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule],
    providers: [
      provideRouter([]),
      { provide: CampaignApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c-1' }), queryParamMap: convertToParamMap({}) } } },
      { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1', status: 'active' }) } },
    ],
  }).compileComponents();
  const state = TestBed.inject(CampaignStudioStateService);
  api.getById.and.returnValue(of({
    ...state.draft, id: 'c-1', entityId: 'e-1', status: 'draft', title: 'קמפיין', slug: 'kampein', targetAmount: 1000,
    blocks: blocks(), ...overrides(state.draft),
  }));
  const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
  fixture.detectChanges();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  // Opens the toolbar's "תבנית" gallery and picks a card by name (blue palette).
  const pick = (name: string) => {
    Array.from(el.querySelectorAll<HTMLButtonElement>('.tool-btn--text')).find(b => b.textContent!.includes('תבנית'))!.click();
    fixture.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('.tp-swatch')[TEMPLATE_PALETTES.indexOf(blue)].click();
    fixture.detectChanges();
    const card = Array.from(el.querySelectorAll<HTMLElement>('.tp-card')).find(c => c.querySelector('.tp-card-name')!.textContent!.includes(name));
    expect(card).withContext(`gallery card ${name}`).toBeDefined();
    card!.click();
    fixture.detectChanges();
  };
  return { fixture, state, page: fixture.componentInstance, el, pick };
}

const snapshot = (d: unknown) => JSON.parse(JSON.stringify(d));
const quick = CAMPAIGN_TEMPLATES.find(t => t.pageFormat === 'minimal')!;
const classic = CAMPAIGN_TEMPLATES.find(t => t.id === 'classic')!;

describe('Studio: the quick donation page is a template in the same gallery', () => {
  it('there is no separate Regular/Minimal toggle; the "תבנית" action stays available on every page type', async () => {
    const { el, fixture, state, page } = await setup();
    expect(el.querySelector('.format-switch, .format-btn')).toBeNull();
    state.patch({ layout: { ...state.draft.layout, pageFormat: 'minimal' } });
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('.tool-btn--text')).some(b => b.textContent!.includes('תבנית'))).toBeTrue();
    page.history.stop();
  });

  it('the gallery lists the quick donation page next to the regular templates and marks the current one', async () => {
    const { el, fixture, page } = await setup();
    page.showTemplatePicker = true;
    fixture.detectChanges();
    const names = Array.from(el.querySelectorAll('.tp-card-name')).map(n => n.textContent!);
    expect(names.length).toBe(CAMPAIGN_TEMPLATES.length);
    expect(names.some(n => n.includes(quick.name))).toBeTrue();
    const current = el.querySelector('.tp-card--current .tp-card-name')!.textContent!;
    expect(current).toContain(classic.name);
    expect(current).toContain('התבנית הנוכחית');
    page.history.stop();
  });

  it('choosing it hides the regular content without deleting it; choosing a regular template restores it', async () => {
    const { el, state, page, pick } = await setup();
    const before = snapshot(state.draft);
    const confirmSpy = spyOn(window, 'confirm');

    pick(quick.name);
    expect(state.draft.layout.pageFormat).toBe('minimal');
    expect(state.draft.layout.templateId).toBe(quick.id);
    expect(page.showTemplatePicker).toBeFalse();
    expect(el.querySelector('app-minimal-donation-page')).withContext('same Studio, live preview switches').not.toBeNull();
    expect(el.querySelector('app-campaign-preview')).toBeNull();
    expect(snapshot(state.draft.blocks)).withContext('blocks kept while hidden').toEqual(before.blocks);
    expect(state.draft.coverImageUrl).toBe(before.coverImageUrl);
    expect(snapshot(state.draft.heroTextStyle)).toEqual(before.heroTextStyle);
    expect(state.draft.id).toBe('c-1');

    pick(classic.name);
    expect(el.querySelector('app-campaign-preview')).not.toBeNull();
    expect(el.querySelector('app-minimal-donation-page')).toBeNull();
    expect(state.draft.layout.pageFormat).toBeUndefined();
    expect(snapshot(state.draft.blocks)).withContext('same blocks, same order').toEqual(before.blocks);
    expect(snapshot(state.draft.heroTextStyle)).toEqual(before.heroTextStyle);
    expect(state.draft.layout.templateId).toBe('classic');
    expect(state.draft.layout.theme.primaryColor).withContext('a customized color is kept').toBe('#123456');
    expect(confirmSpy).withContext('a draft switches without asking').not.toHaveBeenCalled();
    page.history.stop();
  });

  it('a page created as a quick donation page gets the chosen template\'s starter blocks the first time', async () => {
    const { state, page, pick } = await setup(d => ({ blocks: [], layout: { ...d.layout, pageFormat: 'minimal', templateId: 'minimal-donation' } }));
    pick(classic.name);
    expect(state.draft.layout.pageFormat).toBeUndefined();
    expect(state.draft.blocks.length).toBe(classic.createBlocks(blue).length);
    const starter = snapshot(state.draft.blocks);
    pick(quick.name);
    pick(classic.name);
    expect(snapshot(state.draft.blocks)).toEqual(starter);
    page.history.stop();
  });

  it('a published campaign asks before changing the page type; cancelling leaves it unchanged', async () => {
    const { state, page, pick } = await setup(d => ({ ...designed(d), status: 'published' }));
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    pick(quick.name);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.calls.mostRecent().args[0]).toContain('גלוי לתורמים');
    expect(state.draft.layout.pageFormat).toBeUndefined();

    confirmSpy.and.returnValue(true);
    pick(quick.name);
    expect(state.draft.layout.pageFormat).toBe('minimal');
    expect(state.draft.status).toBe('published');

    confirmSpy.calls.reset();
    pick(quick.name);
    expect(confirmSpy).withContext('no type change, no question').not.toHaveBeenCalled();
    page.history.stop();
  });

  it('a published campaign switching between regular templates is not asked (unchanged behavior)', async () => {
    const { page, pick } = await setup(d => ({ ...designed(d), status: 'published' }));
    const confirmSpy = spyOn(window, 'confirm');
    pick(CAMPAIGN_TEMPLATES.find(t => t.id === 'magazine')!.name);
    expect(confirmSpy).not.toHaveBeenCalled();
    page.history.stop();
  });

  it('a published quick donation page without a main image cannot move to a regular template', async () => {
    const { state, page, pick } = await setup(d => ({ status: 'published', coverImageUrl: null as any, heroType: 'image', layout: { ...d.layout, pageFormat: 'minimal', templateId: 'minimal-donation' } }));
    const confirmSpy = spyOn(window, 'confirm');
    const alertSpy = spyOn(window, 'alert');
    pick(classic.name);
    expect(alertSpy.calls.mostRecent().args[0]).toContain('תמונה / וידאו ראשי');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(state.draft.layout.pageFormat).toBe('minimal');
    page.history.stop();
  });

  it('undo reverts the switch', async () => {
    const { state, page, pick } = await setup();
    pick(quick.name);
    page.history.commit();
    page.undo();
    expect(state.draft.layout.pageFormat).toBeUndefined();
    page.history.stop();
  });
});

describe('Quick donation template: save and reload through the existing campaign API', () => {
  it('saves pageFormat inside layout together with every block, and reloads both', () => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [provideRouter([])] });
    const api = TestBed.inject(CampaignApiService);
    const state = TestBed.inject(CampaignStudioStateService);
    const http = TestBed.inject(HttpTestingController);
    state.patch({ id: 'c-1', blocks: blocks() });
    state.switchTemplate(quick, blue);

    api.update('c-1', state.draft).subscribe();
    const save = http.expectOne(r => r.method !== 'GET');
    expect(save.request.body.layout.pageFormat).toBe('minimal');
    expect(save.request.body.layout.templateId).toBe('minimal-donation');
    expect(save.request.body.blocks.map((b: any) => b.id)).toEqual(['hero-1', 'story-1', 'video-1']);
    save.flush({ ...save.request.body, id: 'c-1' });

    let reloaded!: CampaignDraft;
    api.getById('c-1').subscribe(d => (reloaded = d));
    http.expectOne(r => r.method === 'GET').flush({ id: 'c-1', layout: save.request.body.layout, blocks: save.request.body.blocks });
    expect(reloaded.layout.pageFormat).toBe('minimal');
    expect(reloaded.blocks.map(b => b.id)).toEqual(['hero-1', 'story-1', 'video-1']);

    state.patch(reloaded);
    state.switchTemplate(classic, blue);
    expect(state.draft.blocks.map(b => b.id)).toEqual(['hero-1', 'story-1', 'video-1']);
    expect((state.draft.blocks[1].data as any).content).toBe('<p>הסיפור שלנו</p>');
    expect(state.draft.blocks[2].visible).toBeFalse();
  });
});
