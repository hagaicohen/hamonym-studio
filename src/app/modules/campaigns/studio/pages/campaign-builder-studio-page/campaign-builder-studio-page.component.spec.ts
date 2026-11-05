import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { CampaignPreviewComponent } from '../../preview/campaign-preview/campaign-preview.component';
import { CampaignStudioTopbarComponent } from '../../topbar/campaign-studio-topbar/campaign-studio-topbar.component';
import { CampaignsPageComponent } from '../../../pages/campaigns-page/campaigns-page.component';
import { of } from 'rxjs';
import { CampaignBuilderStudioPageComponent, buildStudioTree } from './campaign-builder-studio-page.component';
import { CampaignBlock, CampaignDraft, CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { RichTextBlockEditorComponent } from '../../../builder/block-editors/rich-text-block-editor.component';
import { ImageBlockEditorComponent } from '../../../builder/block-editors/image-block-editor.component';
import { CAMPAIGN_TEMPLATES, TEMPLATE_PALETTES } from '../../../builder/templates/campaign-templates';
import { BLOCK_GROUPS } from '../../../builder/block-catalog';
import { isSectionAvailableFor } from '../../../services/owner-registry';
import type { BlockType } from '../../../services/campaign-studio-state.service';

const blocks: CampaignBlock[] = [
  { id: 'hero-1', type: 'hero', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} as any },
  { id: 'box-1', type: 'container', order: 1, visible: true, label: 'מסגרת', spacingTop: 0, spacingBottom: 0,
    data: { childBlockIds: ['img-1', 'story-1'], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 16, direction: 'column' } as any },
  { id: 'story-1', type: 'rich-text', order: 0, visible: true, label: 'הסיפור שלנו', spacingTop: 8, spacingBottom: 8, data: { content: '<p>סיפור</p>', lineHeight: 1.6 } as any },
  { id: 'img-1', type: 'image', order: 1, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { url: 'https://example.com/a.jpg', caption: '' } as any },
  { id: 'rewards-1', type: 'rewards', order: 2, visible: false, label: 'תשורות', spacingTop: 0, spacingBottom: 0, data: {} as any },
];

function campaign(state: CampaignStudioStateService, overrides: Partial<CampaignDraft> = {}): CampaignDraft {
  return { ...state.draft, id: 'c-1', entityId: 'e-1', status: 'draft', title: 'קמפיין לבדיקה', blocks: structuredClone(blocks), ...overrides };
}

async function setup(overrides: Partial<CampaignDraft> | ((d: CampaignDraft) => Partial<CampaignDraft>) = {}) {
  const api = { getById: jasmine.createSpy('getById'), update: jasmine.createSpy('update'), create: jasmine.createSpy('create') };
  await TestBed.configureTestingModule({
    imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule],
    providers: [
      provideRouter([]),
      { provide: CampaignApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c-1' }), queryParamMap: convertToParamMap({}) } } },
      { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1' }) } },
    ],
  }).compileComponents();
  const state = TestBed.inject(CampaignStudioStateService);
  const base = campaign(state);
  api.getById.and.returnValue(of({ ...base, ...(typeof overrides === 'function' ? overrides(base) : overrides) }));
  const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
  fixture.detectChanges();
  fixture.detectChanges();
  return { fixture, state, api, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

const rowLabels = (el: HTMLElement) => Array.from(el.querySelectorAll('.tree-row .tree-label')).map(n => n.textContent!.trim());

describe('Campaign Builder Studio — shell', () => {
  it('builds the tree from blocks: top-level by order, nested children by order, hidden blocks included', () => {
    const tree = buildStudioTree(blocks);
    expect(tree.map(n => n.key)).toEqual(['hero-1', 'box-1', 'rewards-1']);
    expect(tree[1].children.map(n => n.key)).toEqual(['story-1', 'img-1']);
    expect(tree[1].children[0].scopeIds).toEqual(['story-1', 'img-1']);
    expect(tree[2].block!.visible).toBeFalse();
  });

  it('renders the three panels with the opening area, blocks and the real campaign renderer', async () => {
    const { el } = await setup();
    expect(el.querySelector('.tree-panel')).not.toBeNull();
    expect(el.querySelector('.props-panel')).not.toBeNull();
    expect(el.querySelector('.canvas-frame app-campaign-preview')).not.toBeNull();
    expect(rowLabels(el)).toEqual(['פתיחה: תמונה, כותרת ותיאור', 'עיצוב העמוד: סגנון, צבעים ורקע', 'לוגו', 'פוטר', 'סוג, יעד ותאריכים', 'הגדרות תרומה', 'רשימת התשורות', 'אפשרויות הרשמה', 'רשימת החסויות', 'רשימת השגרירים', 'רשימת העדכונים', 'Hero (תמונה ראשית)', 'מסגרת', 'הסיפור שלנו', 'תמונה', 'תשורות']);
    expect(getComputedStyle(el.querySelector('.studio')!).direction).toBe('rtl');
  });

  it('selecting in the tree highlights the same block in the canvas', async () => {
    const { fixture, el, page } = await setup();
    (Array.from(el.querySelectorAll<HTMLElement>('.tree-row')).find(r => r.textContent!.includes('הסיפור שלנו'))!).click();
    fixture.detectChanges();
    expect(page.selectedKey).toBe('story-1');
    expect(el.querySelectorAll('.tree-row.is-selected').length).toBe(1);
    const highlighted = Array.from(el.querySelectorAll('.canvas-frame .studio-selected'));
    expect(highlighted.length).toBeGreaterThan(0);
    expect(highlighted.every(n => n.getAttribute('data-block-id') === 'story-1')).toBeTrue();
  });

  it('clicking a block in the canvas selects it in the tree and the properties panel', async () => {
    const { fixture, el, state, page } = await setup();
    state.requestFocusBlock('img-1', 'image');
    fixture.detectChanges();
    expect(page.selectedKey).toBe('img-1');
    expect(el.querySelector('.tree-row.is-selected .tree-label')!.textContent!.trim()).toBe('תמונה');
    expect(el.querySelector('.props-panel app-image-block-editor')).not.toBeNull();
  });

  it("the properties panel hosts only the selected block's Step 9 editor, with no classic-editor link", async () => {
    const { fixture, el, page } = await setup();
    page.select('story-1'); fixture.detectChanges();
    expect(el.querySelectorAll('.props-host .block-editor--studio').length).toBe(1);
    expect(el.querySelectorAll('.props-host app-rich-text-block-editor').length).toBe(2);
    expect(el.querySelector('.props-host .step-container')).toBeNull();
    page.select('rewards-1'); fixture.detectChanges();
    expect(el.querySelector('.props-host app-rich-text-block-editor')).toBeNull();
    expect(el.querySelectorAll('.props-host .block-editor--studio').length).toBe(1);
    expect(el.querySelector('.props-panel .props-link')).toBeNull();
  });

  it('tree actions reuse the existing state operations: visibility, move within scope and properties', async () => {
    const { fixture, el, state, page } = await setup();
    spyOn(state, 'toggleBlockVisibility').and.callThrough();
    spyOn(state, 'moveBlockDownInScope').and.callThrough();
    const storyRow = Array.from(el.querySelectorAll<HTMLElement>('.tree-row')).find(r => r.textContent!.includes('הסיפור שלנו'))!;
    (storyRow.querySelectorAll('.tree-action')[1] as HTMLButtonElement).click();
    expect(state.moveBlockDownInScope).toHaveBeenCalledWith('story-1', ['story-1', 'img-1']);
    (storyRow.querySelectorAll('.tree-action')[3] as HTMLButtonElement).click();
    expect(state.toggleBlockVisibility).toHaveBeenCalledWith('story-1');
    page.select('story-1'); fixture.detectChanges();
    const label = el.querySelector('.props-host .editor-input') as HTMLInputElement;
    label.value = 'כותרת חדשה'; label.dispatchEvent(new Event('input'));
    expect(state.draft.blocks.find(b => b.id === 'story-1')!.label).toBe('כותרת חדשה');
    fixture.detectChanges();
    const spacing = Array.from(el.querySelectorAll<HTMLInputElement>('.props-host input[type=range]')).find(i => i.getAttribute('max') === '80')!;
    spacing.value = '24'; spacing.dispatchEvent(new Event('input'));
    expect(state.draft.blocks.find(b => b.id === 'story-1')!.spacingTop).toBe(24);
  });

  it('adding a component uses the same catalog and single-instance rule as Step 9 and selects it', async () => {
    const { fixture, el, state, page } = await setup();
    (el.querySelector('.add-btn') as HTMLButtonElement).click(); fixture.detectChanges();
    const items = Array.from(el.querySelectorAll<HTMLButtonElement>('.add-item'));
    expect(items.find(b => b.textContent!.includes('תשורות'))!.disabled).toBeTrue();
    items.find(b => b.textContent!.includes('טקסט'))!.click(); fixture.detectChanges();
    const added = state.draft.blocks.filter(b => b.type === 'rich-text');
    expect(added.length).toBe(2);
    expect(page.selectedKey).toBe(added.find(b => b.id !== 'story-1')!.id);
  });

  it('template switching in the Studio is the non-destructive switchTemplate', async () => {
    const { state, page } = await setup();
    spyOn(state, 'applyTemplate');
    page.onTemplateSelected({ template: CAMPAIGN_TEMPLATES.find(t => t.id === 'magazine')!, palette: TEMPLATE_PALETTES[0] });
    expect(state.applyTemplate).not.toHaveBeenCalled();
    expect(state.draft.id).toBe('c-1');
    expect(state.draft.blocks.map(b => b.id).sort()).toEqual(blocks.map(b => b.id).sort());
    expect(state.draft.layout.templateId).toBe('magazine');
  });

  it('undo and redo are shown but disabled', async () => {
    const { el } = await setup();
    const tools = Array.from(el.querySelectorAll<HTMLButtonElement>('.studio-tools .tool-btn'));
    expect(tools.filter(b => b.disabled).length).toBe(2);
  });

  // Final sprint: minimal donation pages open in the Studio (group-final.spec.ts).
  it('minimal donation pages open in the Studio with their own canvas', async () => {
    const minimal = await setup(d => ({ layout: { ...d.layout, pageFormat: 'minimal' } }));
    expect(minimal.el.querySelector('.studio')).not.toBeNull();
    expect(minimal.el.querySelector('.canvas-frame app-minimal-donation-page')).not.toBeNull();
  });

  it('partner pages stay on their existing editor', async () => {
    const partner = await setup({ ownerType: 'partner' });
    expect(partner.el.querySelector('.studio')).toBeNull();
    expect(partner.el.querySelector('.studio-message')).not.toBeNull();
  });

  it('leaving the Studio turns the canvas selection mode off', async () => {
    const { fixture, state } = await setup();
    let active = true;
    state.pageBuilderActive$.subscribe(v => active = v);
    fixture.destroy();
    expect(active).toBeFalse();
  });
});

describe('Shared block editors (extracted from Step 9)', () => {
  let state: CampaignStudioStateService;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [provideRouter([])] }).compileComponents();
    state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft(campaign(state));
  });

  it('rich text editor updates content, line height and heading style through updateBlockData', () => {
    const editor = TestBed.createComponent(RichTextBlockEditorComponent).componentInstance;
    editor.updateRichText('story-1', '<p>חדש</p>');
    editor.updateRichTextLineHeight('story-1', 2);
    editor.updateRichTextHeadingStyle('story-1', { align: 'right', color: '#111111', fontSize: 'md', position: 'top' } as any);
    const data = state.draft.blocks.find(b => b.id === 'story-1')!.data as any;
    expect(data.content).toBe('<p>חדש</p>');
    expect(data.lineHeight).toBe(2);
    expect(data.headingStyle.align).toBe('right');
  });

  it('image editor updates fields, width, height and resets height', () => {
    const editor = TestBed.createComponent(ImageBlockEditorComponent).componentInstance;
    editor.updateImageField('img-1', 'caption', 'כיתוב');
    editor.updateImageWidth('img-1', 60);
    editor.updateImageHeight('img-1', 300);
    let data = state.draft.blocks.find(b => b.id === 'img-1')!.data as any;
    expect([data.caption, data.widthPercent, data.heightPx]).toEqual(['כיתוב', 60, 300]);
    editor.resetImageHeight('img-1');
    data = state.draft.blocks.find(b => b.id === 'img-1')!.data as any;
    expect(data.heightPx).toBeUndefined();
  });

  it('Step 9 renders the extracted editors and keeps its label and spacing behavior', () => {
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    const step = fixture.componentInstance;
    step.updateLabel('img-1', 'תמונה ראשית');
    step.updateSpacing('img-1', 'spacingBottom', 32);
    const img = state.draft.blocks.find(b => b.id === 'img-1')!;
    expect([img.label, img.spacingBottom]).toEqual(['תמונה ראשית', 32]);
  });
});

describe('Campaign Builder Studio — new, unsaved campaign', () => {
  async function setupNew() {
    const api = {
      getById: jasmine.createSpy('getById'),
      update: jasmine.createSpy('update'),
      create: jasmine.createSpy('create').and.returnValue(of({ id: 'new-1' })),
    };
    await TestBed.configureTestingModule({
      imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        { provide: CampaignApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) } } },
        { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1' }) } },
      ],
    }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft({ ...state.draft, id: 'leftover', title: 'קמפיין קודם' });
    const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
    fixture.detectChanges();
    return { fixture, state, api, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('opens without a campaign id or server record, from a fresh draft, with the preset picker', async () => {
    const { el, state, api, page } = await setupNew();
    expect(api.getById).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    expect(page.isNew).toBeTrue();
    expect(state.draft.id).toBeUndefined();
    expect(state.isEditMode).toBeFalse();
    expect(el.querySelector('app-campaign-preset-picker')).not.toBeNull();
    expect(el.querySelector('.studio .canvas-frame app-campaign-preview')).not.toBeNull();
    expect(el.querySelector('.status-chip')!.textContent).toContain('טרם נשמר');
  });

  it('preset then template starts the page through the same startFromTemplate as the classic flow', async () => {
    const { fixture, el, state, page } = await setupNew();
    spyOn(state, 'startFromTemplate').and.callThrough();
    page.onPresetSelected('race');
    fixture.detectChanges();
    expect(el.querySelector('app-template-picker')).not.toBeNull();
    const t = CAMPAIGN_TEMPLATES.find(x => x.id === 'story-first')!;
    page.onStartTemplateSelected({ template: t, palette: TEMPLATE_PALETTES[0] });
    fixture.detectChanges();
    expect(state.startFromTemplate).toHaveBeenCalled();
    expect(state.draft.layout.preset).toBe('race');
    expect(state.draft.layout.templateId).toBe('story-first');
    expect(state.draft.blocks.length).toBe(t.createBlocks(TEMPLATE_PALETTES[0]).length);
    expect(el.querySelectorAll('.tree-row').length).toBeGreaterThan(1);
  });

  it('a minimal donation page is created in the Studio, not sent to the classic flow', async () => {
    const { page } = await setupNew();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    page.onStartTemplateSelected({ template: CAMPAIGN_TEMPLATES.find(x => x.pageFormat === 'minimal')!, palette: TEMPLATE_PALETTES[0] });
    expect(router.navigate).not.toHaveBeenCalled();
    expect(page.state.draft.layout.pageFormat).toBe('minimal');
    page.history.stop();
  });

  it('classic-editor links are replaced by a note until the first save, so the unsaved draft is never reset', async () => {
    const { fixture, el, page } = await setupNew();
    page.onPresetSelected('general');
    page.onStartTemplateSelected({ template: CAMPAIGN_TEMPLATES[0], palette: TEMPLATE_PALETTES[0] });
    page.select(page.openingKey); fixture.detectChanges();
    expect(el.querySelector('.props-panel .props-link')).toBeNull();
    expect(el.querySelector('.studio-tools a.tool-btn')).toBeNull();
  });

  it('the first save uses the existing create flow and continues in the Studio', async () => {
    const { fixture, api, page } = await setupNew();
    page.onPresetSelected('general');
    page.onStartTemplateSelected({ template: CAMPAIGN_TEMPLATES[0], palette: TEMPLATE_PALETTES[0] });
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const topbar = fixture.debugElement.query(By.directive(CampaignStudioTopbarComponent)).componentInstance as CampaignStudioTopbarComponent;
    expect(topbar.editorPath).toBe('studio');
    topbar.saveDraft();
    expect(api.create).toHaveBeenCalledWith('e-1', jasmine.anything());
    expect(router.navigate).toHaveBeenCalledWith(['/campaigns', 'new-1', 'studio'], { replaceUrl: true });
  });
});

describe('Campaign Builder Studio — entry point', () => {
  it('the campaigns page creates new campaigns in the Studio (campaign-editor-route.spec.ts covers the rest)', () => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const page = TestBed.runInInjectionContext(() => new CampaignsPageComponent());
    page.createCampaign();
    expect(router.navigate).toHaveBeenCalledWith(['/campaigns/create/studio']);
  });
});

describe('Campaign Builder Studio — visual shell', () => {
  it('opens with the opening area selected and its existing editor ready', async () => {
    const { el, page } = await setup();
    expect(page.selectedKey).toBe(page.openingKey);
    expect(el.querySelector('.tree-row--area.is-selected')).not.toBeNull();
    expect(el.querySelector('.props-panel app-campaign-basic-step')).not.toBeNull();
    expect(el.querySelector('.props-empty')).toBeNull();
  });

  it('an empty campaign shows preview-only placeholders and never writes them to the campaign', async () => {
    const empty = await setup(d => ({ title: '', shortDescription: '', coverImageUrl: null, targetAmount: 0,
      blocks: [{ id: 't1', type: 'rich-text', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { content: '', lineHeight: 1.6 } as any }] }));
    const canvas = empty.el.querySelector('.canvas-frame')!;
    expect(canvas.querySelector('.empty-state')).toBeNull();
    expect(canvas.textContent).toContain('כותרת הקמפיין שלכם');
    expect(canvas.textContent).toContain('כאן יופיע סיפור הקמפיין');
    expect(empty.el.querySelector('.canvas-hint')).not.toBeNull();
    const draft = empty.state.draft;
    expect(draft.title).toBe('');
    expect(draft.shortDescription).toBe('');
    expect(draft.coverImageUrl).toBeNull();
    expect(draft.targetAmount).toBe(0);
    expect((draft.blocks[0].data as any).content).toBe('');
  });

  it('real content is shown as-is, with no placeholder hint', async () => {
    const { el } = await setup(d => ({ shortDescription: 'תיאור אמיתי', coverImageUrl: 'https://example.com/c.jpg', targetAmount: 1000 }));
    expect(el.querySelector('.canvas-hint')).toBeNull();
    expect(el.querySelector('.canvas-frame')!.textContent).toContain('קמפיין לבדיקה');
  });

  it('one toolbar: the Studio tools and status sit inside the existing topbar next to save and devices', async () => {
    const { el } = await setup();
    const topbar = el.querySelector('app-campaign-studio-topbar')!;
    expect(topbar.querySelector('.studio-tools')).not.toBeNull();
    expect(topbar.querySelector('.status-chip')).not.toBeNull();
    expect(topbar.querySelector('.save-button')).not.toBeNull();
    expect(topbar.querySelectorAll('.device-button').length).toBe(3);
    expect(el.querySelector('.studio-toolbar')).toBeNull();
  });

  it('side panels collapse to a rail and can be resized', async () => {
    const { fixture, el, page } = await setup();
    (el.querySelector('.tree-panel .panel-toggle') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(page.treeCollapsed).toBeTrue();
    expect(el.querySelector('.tree-panel .tree')).toBeNull();
    expect(page.gridColumns.startsWith('44px')).toBeTrue();
    page.toggleTree();
    page.startResize('props', new PointerEvent('pointerdown', { clientX: 500 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 560 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(page.propsWidth).toBe(420);
  });
});

describe('Campaign Builder Studio — Group D: block editor parity', () => {
  const campaignTypes = (): BlockType[] =>
    [...new Set(BLOCK_GROUPS.flatMap(g => g.types))].filter(t => isSectionAvailableFor(t, 'campaign'));

  async function setupWith(types: BlockType[]) {
    const ctx = await setup(d => ({ blocks: [] }));
    const ids = types.map(t => ctx.state.addBlock(t));
    ctx.fixture.detectChanges();
    return { ...ctx, ids };
  }

  it('every block type available on a campaign is selectable and shows only its own Step 9 editor', async () => {
    const types = campaignTypes();
    expect(types.length).toBeGreaterThanOrEqual(19);
    const { fixture, el, page, state, ids } = await setupWith(types);
    types.forEach((type, i) => {
      page.select(ids[i]); fixture.detectChanges();
      const editors = el.querySelectorAll('.props-host .block-editor--studio');
      expect(editors.length).withContext(type).toBe(1);
      expect(editors[0].querySelectorAll('input, select, textarea, button, app-rich-text-block-editor, .system-note, .container-design-header').length)
        .withContext(type + ' has controls').toBeGreaterThan(0);
      expect(el.querySelector('.tree-row.is-selected')).withContext(type + ' selected in tree').not.toBeNull();
    });
    // Tabs and panels create their own child containers.
    expect(state.draft.blocks.length).toBeGreaterThanOrEqual(types.length);
  });

  it('switching between blocks and areas never turns off canvas selection mode', async () => {
    const { fixture, page, state, ids } = await setupWith(['video', 'stats', 'cta']);
    let active = false;
    state.pageBuilderActive$.subscribe(v => active = v);
    for (const id of [...ids, page.openingKey, ids[0]]) { page.select(id); fixture.detectChanges(); }
    expect(active).toBeTrue();
    state.requestFocusBlock(ids[1], 'stats'); fixture.detectChanges();
    expect(page.selectedKey).toBe(ids[1]);
  });

  it('hosted editors write through the existing Step 9 logic: video, divider, CTA and container', async () => {
    const { fixture, el, page, state, ids } = await setupWith(['video', 'divider', 'cta', 'container']);
    const data = (id: string) => state.draft.blocks.find(b => b.id === id)!.data as any;

    page.select(ids[0]); fixture.detectChanges();
    const url = el.querySelector('.props-host input[type=url]') as HTMLInputElement;
    url.value = 'https://youtu.be/abc'; url.dispatchEvent(new Event('change'));
    expect(data(ids[0]).url).toBe('https://youtu.be/abc');

    page.select(ids[1]); fixture.detectChanges();
    const before = data(ids[1]).showLine;
    const toggle = Array.from(el.querySelectorAll<HTMLElement>('.props-host .donation-toggle-item')).find(e => e.textContent!.includes('הצג קו מפריד'))!;
    toggle.click();
    expect(data(ids[1]).showLine).toBe(!before);

    page.select(ids[2]); fixture.detectChanges();
    expect(el.querySelector('.props-host')!.textContent).toContain('מטרת הכפתור');

    page.select(ids[3]); fixture.detectChanges();
    expect(el.querySelector('#studio-block-label')).not.toBeNull();
    (el.querySelector('.props-host .container-design-header') as HTMLElement).click(); fixture.detectChanges();
    expect(el.querySelector('.props-host')!.textContent).toContain('סידור הבלוקים');
  });

  it('a block nested in a container gets its parent context in the hosted editor', async () => {
    const { fixture, el, page } = await setup();
    page.select('img-1'); fixture.detectChanges();
    expect(el.querySelector('.props-host app-image-block-editor')).not.toBeNull();
  });
});

describe('Classic Step 9 after the editor body moved into a shared template', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule], providers: [provideRouter([])] }).compileComponents();
  });

  it('still renders the full builder and opens a block editor inline; page-builder mode on and off as before', () => {
    const state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft(campaign(state));
    let active = false;
    state.pageBuilderActive$.subscribe(v => active = v);
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(active).toBeTrue();
    expect(el.querySelector('.step-container')).not.toBeNull();
    expect(el.querySelector('.block-editor--studio')).toBeNull();
    fixture.componentInstance.editingBlockId = 'rewards-1';
    fixture.detectChanges();
    expect(el.querySelectorAll('.block-editor').length).toBe(1);
    expect(el.querySelector('.block-editor')!.textContent).toContain('מרווחים חיצוניים');
    fixture.destroy();
    expect(active).toBeFalse();
  });

  it('single-block mode renders only that editor and leaves page-builder mode alone', () => {
    const state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft(campaign(state));
    spyOn(state, 'setPageBuilderActive');
    spyOn(state, 'migrateSidebarToContainers');
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    fixture.componentInstance.studioBlockId = 'story-1';
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.step-container')).toBeNull();
    expect(el.querySelectorAll('.block-editor--studio').length).toBe(1);
    fixture.destroy();
    expect(state.setPageBuilderActive).not.toHaveBeenCalled();
    expect(state.migrateSidebarToContainers).not.toHaveBeenCalled();
  });
});

describe('Campaign Builder Studio — Group C: block management', () => {
  const rowOf = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll<HTMLElement>('.tree-row')).find(r => r.querySelector('.tree-label')!.textContent!.trim() === label)!;
  const block = (state: CampaignStudioStateService, id: string) => state.draft.blocks.find(b => b.id === id);
  const children = (state: CampaignStudioStateService, id: string) => (block(state, id)!.data as any).childBlockIds as string[];

  function drag(row: HTMLElement, type: 'dragstart' | 'dragover' | 'drop' | 'dragend', where: 'before' | 'inside' | 'after' = 'inside') {
    const rect = row.getBoundingClientRect();
    const clientY = where === 'before' ? rect.top + 1 : where === 'after' ? rect.bottom - 1 : rect.top + rect.height / 2;
    row.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientY, dataTransfer: new DataTransfer() }));
  }
  function dragTo(fixture: any, from: HTMLElement, to: HTMLElement, where: 'before' | 'inside' | 'after') {
    drag(from, 'dragstart'); fixture.detectChanges();
    drag(to, 'dragover', where); fixture.detectChanges();
    drag(to, 'drop', where); fixture.detectChanges();
  }

  it('delete asks for confirmation; cancel keeps the block, confirm removes it with its nested blocks', async () => {
    const { fixture, el, state, page } = await setup();
    page.select('story-1'); fixture.detectChanges();
    rowOf(el, 'מסגרת').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    fixture.detectChanges();
    const del = Array.from(el.querySelectorAll<HTMLButtonElement>('.context-menu .context-item')).find(b => b.textContent!.includes('מחיקה'))!;
    del.click(); fixture.detectChanges();
    const dialog = el.querySelector('.confirm-dialog')!;
    expect(dialog.textContent).toContain('יימחקו גם 2 רכיבים');
    (Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.includes('ביטול'))!).click(); fixture.detectChanges();
    expect(block(state, 'box-1')).toBeDefined();
    page.askDelete(block(state, 'box-1')!); fixture.detectChanges();
    (el.querySelector('.confirm-btn--danger') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(['box-1', 'story-1', 'img-1'].map(id => block(state, id))).toEqual([undefined, undefined, undefined]);
    expect(page.selectedKey).toBe(page.openingKey);
  });

  it('the properties panel offers the same block actions as the tree menu', async () => {
    const { fixture, el, state, page } = await setup();
    page.select('rewards-1'); fixture.detectChanges();
    const actions = Array.from(el.querySelectorAll<HTMLButtonElement>('.props-actions .props-action'));
    expect(actions.map(a => a.textContent!.trim())).toEqual(['מחיקה']);
    actions[0].click(); fixture.detectChanges();
    (el.querySelector('.confirm-btn--danger') as HTMLButtonElement).click();
    expect(block(state, 'rewards-1')).toBeUndefined();
  });

  it('adds a block inside a container with the same catalog as Step 9 ("+ הוסף לכאן", no Hero)', async () => {
    const { fixture, el, state, page } = await setup();
    page.runAction('add-inside', block(state, 'box-1')!); fixture.detectChanges();
    expect(el.querySelector('.add-menu-head')!.textContent).toContain('הוספה לתוך: מסגרת');
    const items = Array.from(el.querySelectorAll<HTMLButtonElement>('.add-menu .add-item'));
    expect(items.some(b => b.textContent!.includes('Hero'))).toBeFalse();
    items.find(b => b.textContent!.includes('וידאו'))!.click(); fixture.detectChanges();
    const added = state.draft.blocks.find(b => b.type === 'video')!;
    expect(children(state, 'box-1')).toEqual(['img-1', 'story-1', added.id]);
    expect(page.selectedKey).toBe(added.id);
    expect(el.querySelector('.props-host input[type=url]')).not.toBeNull();
  });

  it('adds tabs and panels, converts between them, and keeps every tab a container child', async () => {
    const { fixture, state, page } = await setup();
    const tabs = state.addBlock('tabs');
    const before = children(state, tabs).length;
    page.runAction('add-tab', block(state, tabs)!); fixture.detectChanges();
    const ids = children(state, tabs);
    expect(ids.length).toBe(before + 1);
    expect(block(state, ids[ids.length - 1])!.type).toBe('container');
    expect(block(state, ids[ids.length - 1])!.label).toBe(`טאב ${before + 1}`);
    page.runAction('convert', block(state, tabs)!);
    expect(block(state, tabs)!.type).toBe('accordion');
    page.runAction('add-panel', block(state, tabs)!);
    expect(block(state, children(state, tabs).at(-1)!)!.label).toBe(`פאנל ${before + 2}`);
    page.runAction('convert', block(state, tabs)!);
    expect(block(state, tabs)!.type).toBe('tabs');
  });

  it('swaps a row container right/left, offered only for a row with two or more children', async () => {
    const { state, page } = await setup();
    expect(page.actionsFor(block(state, 'box-1')!).some(a => a.id === 'swap')).toBeFalse();
    state.updateBlockData('box-1', { ...(block(state, 'box-1')!.data as any), direction: 'row' });
    expect(page.actionsFor(block(state, 'box-1')!).some(a => a.id === 'swap')).toBeTrue();
    page.runAction('swap', block(state, 'box-1')!);
    expect(block(state, 'img-1')!.order).toBe(0);
    expect(block(state, 'story-1')!.order).toBe(1);
  });

  it('import review: the badge shows in the tree and "סימון כנבדק" clears it', async () => {
    const { fixture, el, state, page } = await setup(d => ({ blocks: d.blocks.map(b => b.id === 'img-1' ? { ...b, importReview: { needsReview: true, confidence: .6, sourceId: 's' } } : b) }));
    expect(rowOf(el, 'תמונה').querySelector('.tree-review')).not.toBeNull();
    page.runAction('review', block(state, 'img-1')!); fixture.detectChanges();
    expect(block(state, 'img-1')!.importReview).toBeUndefined();
    expect(rowOf(el, 'תמונה').querySelector('.tree-review')).toBeNull();
  });

  it('drag and drop in the tree reorders and re-parents through moveBlockTo, keeping nesting consistent', async () => {
    const { fixture, el, state } = await setup();
    spyOn(state, 'moveBlockTo').and.callThrough();
    dragTo(fixture, rowOf(el, 'תמונה'), rowOf(el, 'הסיפור שלנו'), 'before');
    expect(state.moveBlockTo).toHaveBeenCalledWith('img-1', 'box-1', 0);
    expect(rowOf(el, 'תמונה').closest('ul')!.querySelectorAll('.tree-label')[0].textContent!.trim()).toBe('תמונה');
    dragTo(fixture, rowOf(el, 'תשורות'), rowOf(el, 'מסגרת'), 'inside');
    expect(children(state, 'box-1')).toContain('rewards-1');
    dragTo(fixture, rowOf(el, 'תשורות'), rowOf(el, 'Hero (תמונה ראשית)'), 'after');
    expect(children(state, 'box-1')).not.toContain('rewards-1');
    const top = state.draft.blocks.filter(b => !children(state, 'box-1').includes(b.id)).sort((a, b) => a.order - b.order).map(b => b.id);
    expect(top).toEqual(['hero-1', 'rewards-1', 'box-1']);
  });

  it('rejects drops that would break nesting: into itself, Hero into a container, a block straight into tabs', async () => {
    const { fixture, el, state } = await setup();
    const tabs = state.addBlock('tabs'); fixture.detectChanges();
    spyOn(state, 'moveBlockTo').and.callThrough();
    dragTo(fixture, rowOf(el, 'מסגרת'), rowOf(el, 'הסיפור שלנו'), 'before');
    dragTo(fixture, rowOf(el, 'Hero (תמונה ראשית)'), rowOf(el, 'מסגרת'), 'inside');
    const tabsRow = rowOf(el, block(state, tabs)!.label);
    dragTo(fixture, rowOf(el, 'תשורות'), tabsRow, 'inside');
    expect(state.moveBlockTo).not.toHaveBeenCalled();
    expect(children(state, 'box-1')).toEqual(['img-1', 'story-1']);
  });

  it('a catalog item dragged into the tree is inserted there; drags are published for the canvas', async () => {
    const { fixture, el, state, page } = await setup();
    spyOn(state, 'setDraggedBlockType').and.callThrough();
    spyOn(state, 'setDraggedExistingBlockId').and.callThrough();
    page.openAddMenu(null); fixture.detectChanges();
    const video = Array.from(el.querySelectorAll<HTMLElement>('.add-menu .add-item')).find(b => b.textContent!.includes('וידאו'))!;
    video.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    expect(state.setDraggedBlockType).toHaveBeenCalledWith('video');
    drag(rowOf(el, 'מסגרת'), 'dragover', 'inside'); fixture.detectChanges();
    drag(rowOf(el, 'מסגרת'), 'drop', 'inside'); fixture.detectChanges();
    const added = state.draft.blocks.find(b => b.type === 'video')!;
    expect(children(state, 'box-1')).toContain(added.id);
    drag(rowOf(el, 'תמונה'), 'dragstart');
    expect(state.setDraggedExistingBlockId).toHaveBeenCalledWith('img-1');
    drag(rowOf(el, 'תמונה'), 'dragend');
    expect(state.setDraggedExistingBlockId).toHaveBeenCalledWith(null);
  });

  it('the legacy split block shows in the tree, has its Step 9 editor, and moves and deletes like any block', async () => {
    const { fixture, el, state, page } = await setup(d => ({ blocks: [...d.blocks,
      { id: 'split-1', type: 'split', order: 3, visible: true, label: 'עמודות', spacingTop: 0, spacingBottom: 0,
        data: { leftBlockId: null, rightBlockId: null, leftPercent: 50 } as any }] }));
    expect(rowOf(el, 'עמודות')).toBeDefined();
    page.select('split-1'); fixture.detectChanges();
    expect(el.querySelectorAll('.props-host .block-editor--studio').length).toBe(1);
    expect(el.querySelector('.props-host .editor-input')).not.toBeNull();
    (rowOf(el, 'עמודות').querySelectorAll('.tree-action')[0] as HTMLButtonElement).click();
    expect(block(state, 'split-1')!.order).toBeLessThan(block(state, 'rewards-1')!.order);
    page.askDelete(block(state, 'split-1')!); page.confirmDelete();
    expect(block(state, 'split-1')).toBeUndefined();
  });
});

describe('Legacy sidebar conversion', () => {
  const legacy = (state: CampaignStudioStateService): CampaignDraft => ({
    ...state.draft, id: 'legacy-1', status: 'published', title: 'סיידבר ישן',
    blocks: [
      { id: 's1', type: 'stats', order: 1, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: state.draft.blocks.find(b => b.type === 'stats')!.data },
      { id: 'd1', type: 'donation-widget', order: 2, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: state.draft.blocks.find(b => b.type === 'donation-widget')!.data },
      { id: 't1', type: 'rich-text', order: 3, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { content: '<p>x</p>', lineHeight: 1.6 } as any },
    ],
    layout: { ...state.draft.layout, layoutMode: 'sidebar-right', heroPlacement: undefined },
  });

  it('opening the Studio does not change the campaign data', async () => {
    const api = { getById: jasmine.createSpy('getById'), update: jasmine.createSpy('update'), create: jasmine.createSpy('create') };
    await TestBed.configureTestingModule({
      imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule],
      providers: [provideRouter([]), { provide: CampaignApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'legacy-1' }), queryParamMap: convertToParamMap({}) } } },
        { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1' }) } }],
    }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    const data = legacy(state);
    api.getById.and.returnValue(of(structuredClone(data)));
    const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
    fixture.detectChanges(); fixture.detectChanges();
    const page = fixture.componentInstance;
    for (const id of ['s1', 'd1', 't1', page.openingKey]) { page.select(id); fixture.detectChanges(); }
    expect(state.draft.blocks).toEqual(data.blocks);
    expect(state.draft.layout).toEqual(data.layout);
    expect(api.update).not.toHaveBeenCalled();
  });

  it('the conversion itself is idempotent, and classic Step 9 still runs it on entry', async () => {
    await TestBed.configureTestingModule({ imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule], providers: [provideRouter([])] }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft(legacy(state));
    state.migrateSidebarToContainers();
    const once = structuredClone(state.draft);
    state.migrateSidebarToContainers();
    expect(state.draft).toEqual(once);
    state.loadDraft(legacy(state));
    TestBed.createComponent(CampaignPageBuilderStepComponent).detectChanges();
    expect(state.draft.blocks.some(b => b.type === 'container')).toBeTrue();
  });
});

describe('Classic Step 9 delegates Group C operations to the shared state', () => {
  it('add tab / add panel naming, swap and import review behave as before', async () => {
    await TestBed.configureTestingModule({ imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule], providers: [provideRouter([])] }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft(campaign(state));
    const step = TestBed.createComponent(CampaignPageBuilderStepComponent).componentInstance;
    const tabs = state.addBlock('tabs');
    const count = (state.draft.blocks.find(b => b.id === tabs)!.data as any).childBlockIds.length;
    step.addTab(tabs, state.draft.blocks);
    const last = (state.draft.blocks.find(b => b.id === tabs)!.data as any).childBlockIds.at(-1);
    expect(state.draft.blocks.find(b => b.id === last)!.label).toBe(`טאב ${count + 1}`);
    state.updateBlockData('box-1', { ...(state.draft.blocks.find(b => b.id === 'box-1')!.data as any), direction: 'row' });
    step.swapContainerChildren('box-1');
    expect(state.draft.blocks.find(b => b.id === 'img-1')!.order).toBe(0);
    state.patch({ blocks: state.draft.blocks.map(b => b.id === 'img-1' ? { ...b, importReview: { needsReview: true, confidence: .5, sourceId: 'x' } } : b) });
    step.clearImportReview('img-1');
    expect(state.draft.blocks.find(b => b.id === 'img-1')!.importReview).toBeUndefined();
  });
});

describe('Campaign Builder Studio — canvas drag and drop', () => {
  it('a tree row or catalog item dragged to the canvas reaches the renderer and drops through its existing handler', async () => {
    const { fixture, el, state } = await setup();
    const preview = fixture.debugElement.query(By.directive(CampaignPreviewComponent)).componentInstance as CampaignPreviewComponent;
    const row = Array.from(el.querySelectorAll<HTMLElement>('.tree-row')).find(r => r.querySelector('.tree-label')!.textContent!.trim() === 'תשורות')!;
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    expect(preview.draggingExistingId).toBe('rewards-1');
    spyOn(state, 'moveBlockTo').and.callThrough();
    preview.dropTarget = { parentId: 'box-1', index: 0, indicatorRect: { top: 0, left: 0, width: 0, height: 0 }, mode: 'box' } as any;
    preview.onPreviewDrop(new DragEvent('drop', { cancelable: true }));
    expect(state.moveBlockTo).toHaveBeenCalledWith('rewards-1', 'box-1', 0);
    expect((state.draft.blocks.find(b => b.id === 'box-1')!.data as any).childBlockIds).toContain('rewards-1');
  });
});

describe('Campaign Builder Studio — Group B: campaign design areas', () => {
  it('the logo area hosts the classic logo controls, open: placement, size, shape, background and border', async () => {
    const { fixture, el, state, page } = await setup();
    let active = false;
    state.pageBuilderActive$.subscribe(v => active = v);
    page.select('area:logo'); fixture.detectChanges();
    const host = el.querySelector('.props-host')!;
    expect(host.querySelector('.builder-zone--studio')).not.toBeNull();
    expect(host.querySelector('.logo-upload-btn')).not.toBeNull();
    const position = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.trim() === 'מעל')
      ?? Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.getAttribute('(click)') ?? '').includes('setLogoPosition'));
    const editor = fixture.debugElement.query(By.css('.props-host app-logo-appearance-editor'));
    expect(editor).not.toBeNull();
    editor.componentInstance.shapeChange.emit('square');
    editor.componentInstance.sizeChange.emit('lg');
    editor.componentInstance.borderWidthChange.emit(5);
    expect(state.draft.heroLogoShape).toBe('square');
    expect(state.draft.heroLogoSize).toBe('lg');
    expect(state.draft.layout.theme.logoBorderWidth).toBe(5);
    expect(position).toBeDefined();
    expect(active).toBeTrue();
  });

  it('the page design area hosts style, colors and background; the footer area opens the footer section', async () => {
    const { fixture, el, page } = await setup();
    page.select('area:design'); fixture.detectChanges();
    const host = () => el.querySelector('.props-host')!.textContent!;
    expect(host()).toContain('סגנון עיצובי');
    expect(host()).toContain('צבעים');
    expect(host()).toContain('לוגו');
    page.select('area:footer'); fixture.detectChanges();
    expect(host()).toContain('עמודת "צור קשר"');
  });

  it('classic Step 9 still renders the design area inside its own zone', async () => {
    await TestBed.configureTestingModule({ imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule], providers: [provideRouter([])] }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft(campaign(state));
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.builder-zone--studio')).toBeNull();
    fixture.componentInstance.toggleSection('zone-design');
    fixture.detectChanges();
    expect(el.querySelector('.builder-zone--design')!.textContent).toContain('סגנון עיצובי');
  });
});

describe('Campaign Builder Studio — design-system icons', () => {
  // Decorative emoji / dingbats; user-chosen content (the donation button icon
  // options) is excluded.
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{1D54F}]/u;
  const uiText = (root: Element) => {
    const clone = root.cloneNode(true) as Element;
    clone.querySelectorAll('.tse-icon-btn, input, textarea').forEach(n => n.remove());
    return clone.textContent ?? '';
  };

  it('tree, toolbar and every properties view use icons, not emoji', async () => {
    const { fixture, el, state, page } = await setup();
    const ids = (['stats', 'donation-widget', 'cta', 'tabs', 'accordion', 'gallery', 'share', 'sponsors', 'ambassadors', 'updates', 'comments', 'donors', 'divider', 'video'] as BlockType[])
      .map(t => state.addBlock(t));
    fixture.detectChanges();
    const views = [page.openingKey, 'area:design', 'area:logo', 'area:footer', 'story-1', 'img-1', 'box-1', 'rewards-1', 'hero-1', ...ids];
    for (const key of views) {
      page.select(key); fixture.detectChanges();
      for (const sel of ['.tree-panel', 'app-campaign-studio-topbar', '.props-panel']) {
        const text = uiText(el.querySelector(sel)!);
        expect(EMOJI.test(text)).withContext(`${key} ${sel}: ${text.match(EMOJI)?.[0]}`).toBeFalse();
      }
    }
    expect(el.querySelectorAll('.props-panel lucide-icon').length).toBeGreaterThan(0);
  });
});
