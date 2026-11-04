import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CampaignBlock, CampaignDraft, CampaignStudioStateService } from './services/campaign-studio-state.service';
import { CAMPAIGN_TEMPLATES, TEMPLATE_PALETTES, CampaignTemplate, buildTheme } from './builder/templates/campaign-templates';
import { resolveTheme } from './builder/styles/campaign-styles';
import { CampaignPageBuilderStepComponent } from './builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { TemplatePickerComponent } from './builder/template-picker/template-picker.component';
import { CampaignStudioTopbarComponent } from './studio/topbar/campaign-studio-topbar/campaign-studio-topbar.component';
import { CampaignApiService } from './services/campaign-api.service';
import { CurrentEntityService } from '../../core/services/current-entity.service';

// Template switching (2026-11-04): a switch may re-sequence the order of
// top-level blocks and change layout/palette presentation. It never changes
// identity or fields, never adds, removes, hides or edits a block, and keeps
// customized colors. Only an unsaved page with untouched starter blocks gets
// the new template's starter blocks.

const template = (id: string): CampaignTemplate => CAMPAIGN_TEMPLATES.find(t => t.id === id)!;
const palette = (id: string) => TEMPLATE_PALETTES.find(p => p.id === id)!;
const apply = (state: CampaignStudioStateService, id: string, paletteId = 'blue') => state.switchTemplate(template(id), palette(paletteId));

function existingCampaign(state: CampaignStudioStateService): CampaignDraft {
  const base = state.draft;
  const blocks: CampaignBlock[] = [
    { id: 'hero-1', type: 'hero', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} as any },
    { id: 'box-1', type: 'container', order: 1, visible: true, label: 'מיכל', spacingTop: 8, spacingBottom: 8,
      data: { childBlockIds: ['story-1', 'img-1'], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 12, gap: 16, direction: 'row' } as any },
    { id: 'story-1', type: 'rich-text', order: 0, visible: true, label: 'הסיפור שלנו', spacingTop: 16, spacingBottom: 16,
      data: { content: '<p>תוכן הקמפיין האמיתי</p>', lineHeight: 1.7 } as any },
    { id: 'img-1', type: 'image', order: 1, visible: true, label: '', spacingTop: 0, spacingBottom: 0,
      data: { url: 'https://example.com/a.jpg', alt: 'תמונה' } as any },
    { id: 'stats-1', type: 'stats', order: 2, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: base.blocks.find(b => b.type === 'stats')?.data ?? ({} as any) },
    { id: 'hidden-1', type: 'rich-text', order: 3, visible: false, label: 'טיוטה פנימית', spacingTop: 0, spacingBottom: 0,
      data: { content: '<p>לא מוצג</p>', lineHeight: 1.6 } as any },
    { id: 'faq-1', type: 'accordion', order: 4, visible: true, label: 'שאלות', spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [], items: [] } as any },
    { id: 'rewards-1', type: 'rewards', order: 5, visible: true, label: 'תשורות', spacingTop: 0, spacingBottom: 0, data: {} as any },
  ];
  return {
    ...base,
    id: 'campaign-42', entityId: 'entity-7', status: 'published', currentAmount: 1250, supportersCount: 9,
    createdAt: '2026-10-01T10:00:00Z', publishedAt: '2026-10-02T10:00:00Z',
    title: 'קמפיין קיים', slug: 'existing-campaign', shortDescription: 'תיאור קצר', category: 'education',
    targetAmount: 50000, coverImageUrl: 'https://example.com/cover.jpg',
    suggestedAmounts: [36, 72, 180], allowMonthlyDonation: true,
    offerings: [{ id: 'o1', title: 'תשורה', description: 'תיאור', minimumAmount: 100, stock: 5, imageUrl: null } as any],
    sponsors: [{ id: 's1', name: 'נותן חסות', logoUrl: null } as any],
    updates: [{ id: 'u1', title: 'עדכון', content: 'עדכון ראשון' } as any],
    blocks,
    layout: {
      ...base.layout,
      layoutMode: 'standard', templateId: 'classic', preset: 'donation',
      campaignStyleId: 'civic', styleOverrides: { primaryColor: '#123456' },
      sidebarSections: ['rewards'], openingComposition: 'fundraising-split',
      theme: { ...base.layout.theme, logoBorderColor: '#abcdef', rewardTitleColor: '#fedcba' },
    },
  };
}

// Everything except the template-owned layout keys, the theme and blocks.
function fields(draft: CampaignDraft) {
  const { layoutMode, templateId, heroPlacement, theme, ...layoutRest } = draft.layout;
  const { blocks, ...rest } = draft;
  return { ...rest, layout: layoutRest };
}
// Blocks without their order number: what a switch must never change.
const withoutOrder = (blocks: CampaignBlock[]) => blocks.map(({ order, ...b }) => b);
const topOrder = (draft: CampaignDraft) => draft.blocks.filter(b => !['story-1', 'img-1'].includes(b.id)).sort((a, b) => a.order - b.order).map(b => b.id);

describe('Template switching — existing campaign', () => {
  let state: CampaignStudioStateService;
  let original: CampaignDraft;

  beforeEach(() => {
    state = TestBed.inject(CampaignStudioStateService);
    original = existingCampaign(state);
    state.loadDraft(structuredClone(original));
  });

  it('keeps id, entityId, status, metadata and every top-level field', () => {
    expect(apply(state, 'magazine')).toBeTrue();
    expect(state.draft.id).toBe('campaign-42');
    expect(state.draft.entityId).toBe('entity-7');
    expect(state.draft.status).toBe('published');
    expect(fields(state.draft)).toEqual(fields(original));
    expect(state.isEditMode).toBeTrue();
  });

  it('never adds, removes, hides or edits a block: ids, content, visibility, labels, spacing and nesting stay', () => {
    for (const id of ['donation-first', 'story-first', 'ambassadors-first', 'sidebar-right-hero-column']) {
      apply(state, id);
      expect(withoutOrder(state.draft.blocks)).toEqual(withoutOrder(original.blocks));
    }
    expect(state.draft.blocks.find(b => b.id === 'hidden-1')!.visible).toBeFalse();
  });

  it('re-sequences top-level sections by the template while nested blocks keep their order', () => {
    apply(state, 'donation-first');
    expect(topOrder(state.draft)).toEqual(['hero-1', 'stats-1', 'box-1', 'hidden-1', 'faq-1', 'rewards-1']);
    apply(state, 'story-first');
    expect(topOrder(state.draft)).toEqual(['hero-1', 'box-1', 'hidden-1', 'faq-1', 'stats-1', 'rewards-1']);
    const box = state.draft.blocks.find(b => b.id === 'box-1')!;
    expect((box.data as any).childBlockIds).toEqual(['story-1', 'img-1']);
    expect(state.draft.blocks.find(b => b.id === 'story-1')!.order).toBe(0);
    expect(state.draft.blocks.find(b => b.id === 'img-1')!.order).toBe(1);
  });

  it('keeps Hero and section types the template does not use attached to the block they follow', () => {
    apply(state, 'ambassadors-first');
    const order = topOrder(state.draft);
    expect(order[0]).toBe('hero-1');
    expect(order.indexOf('faq-1')).toBe(order.indexOf('hidden-1') + 1);
  });

  it('repeated switching is stable: the result depends only on the last template', () => {
    for (const id of ['magazine', 'donation-first', 'large-hero', 'sidebar-left-hero-column', 'story-first']) apply(state, id);
    const repeated = topOrder(state.draft);
    state.loadDraft(structuredClone(original));
    apply(state, 'story-first');
    expect(topOrder(state.draft)).toEqual(repeated);
    expect(withoutOrder(state.draft.blocks)).toEqual(withoutOrder(original.blocks));
    expect(fields(state.draft)).toEqual(fields(original));
  });

  it('changes layoutMode, templateId and heroPlacement, clearing the sidebar-only Hero placement elsewhere', () => {
    apply(state, 'sidebar-left-hero-column', 'orange');
    expect(state.draft.layout.layoutMode).toBe('sidebar-left');
    expect(state.draft.layout.templateId).toBe('sidebar-left-hero-column');
    expect(state.draft.layout.heroPlacement).toBe('main-column');
    apply(state, 'story-first');
    expect(state.draft.layout.layoutMode).toBe('standard');
    expect(state.draft.layout.heroPlacement).toBeUndefined();
  });

  it('keeps the chosen Campaign Style, its color overrides and theme fields the template does not own', () => {
    apply(state, 'video-hero', 'red');
    const layout = state.draft.layout;
    expect(layout.campaignStyleId).toBe('civic');
    expect(layout.styleOverrides).toEqual({ primaryColor: '#123456' });
    expect(layout.theme.primaryColor).toBe('#123456');
    expect(layout.theme.secondaryColor).toBe(resolveTheme(layout.theme, 'civic', { primaryColor: '#123456' }).secondaryColor);
    expect(layout.theme.logoBorderColor).toBe('#abcdef');
    expect(layout.theme.rewardTitleColor).toBe('#fedcba');
  });

  it('a saved campaign keeps its blocks even when they are untouched starter blocks', () => {
    const classic = template('classic').createBlocks(palette('green'));
    state.loadDraft({ ...structuredClone(original), blocks: classic });
    apply(state, 'magazine');
    expect(state.draft.blocks.map(b => b.id).sort()).toEqual(classic.map(b => b.id).sort());
  });
});

describe('Template switching — palette colors without a Campaign Style', () => {
  let state: CampaignStudioStateService;
  const noStyle = (theme: Record<string, any>) => {
    const d = existingCampaign(state);
    state.loadDraft({ ...d, layout: { ...d.layout, campaignStyleId: undefined, styleOverrides: undefined, theme: { ...d.layout.theme, ...theme } } });
  };
  beforeEach(() => { state = TestBed.inject(CampaignStudioStateService); });

  it('applies the new palette when the colors still come from a template palette', () => {
    noStyle(buildTheme(palette('green')));
    apply(state, 'magazine', 'pink');
    const pink = buildTheme(palette('pink'));
    for (const key of Object.keys(pink)) expect((state.draft.layout.theme as any)[key]).toBe(pink[key]);
  });

  it('keeps a manually customized color and updates only the untouched palette colors', () => {
    noStyle({ ...buildTheme(palette('green')), primaryColor: '#111111' });
    apply(state, 'magazine', 'pink');
    expect(state.draft.layout.theme.primaryColor).toBe('#111111');
    expect(state.draft.layout.theme.topStripBg).toBe(buildTheme(palette('pink'))['topStripBg']);
  });

  it('keeps every color when none of them matches a template palette', () => {
    const custom = { primaryColor: '#101010', secondaryColor: '#202020', accentColor: '#303030', topStripBg: '#404040', rewardsBg: '#505050', rewardCardBorderActive: '#606060', lineColor: '#707070' };
    noStyle(custom);
    apply(state, 'magazine', 'pink');
    for (const [key, value] of Object.entries(custom)) expect((state.draft.layout.theme as any)[key]).toBe(value);
  });
});

describe('Template switching — new unsaved campaign', () => {
  let state: CampaignStudioStateService;
  beforeEach(() => { state = TestBed.inject(CampaignStudioStateService); state.reset(); });

  it('untouched starter blocks are replaced by the new template starter blocks; entered fields stay', () => {
    const classic = template('classic');
    state.applyTemplate(classic.createBlocks(palette('green')), classic.buildTheme(palette('green')), classic.layoutMode, classic.id, classic.heroPlacement, classic.pageFormat);
    state.patch({ title: 'קמפיין חדש', shortDescription: 'תיאור', targetAmount: 1000 });
    apply(state, 'magazine', 'pink');
    expect(state.draft.blocks.map(b => b.type)).toEqual(template('magazine').createBlocks(palette('pink')).map(b => b.type));
    expect(state.draft.title).toBe('קמפיין חדש');
    expect(state.draft.targetAmount).toBe(1000);
    expect(state.draft.id).toBeUndefined();
  });

  it('a page that skipped the template picker also gets starter blocks', () => {
    apply(state, 'story-first', 'teal');
    expect(state.draft.layout.templateId).toBe('story-first');
    expect(state.draft.blocks.map(b => b.type)).toEqual(template('story-first').createBlocks(palette('teal')).map(b => b.type));
  });

  it('starter blocks with entered content are kept and only re-sequenced', () => {
    const classic = template('classic');
    state.applyTemplate(classic.createBlocks(palette('green')), classic.buildTheme(palette('green')), classic.layoutMode, classic.id);
    const story = state.draft.blocks.find(b => b.type === 'rich-text')!;
    state.patch({ blocks: state.draft.blocks.map(b => b.id === story.id ? { ...b, data: { ...(b.data as any), content: '<p>כתבתי</p>' } } : b) });
    const before = state.draft.blocks;
    apply(state, 'magazine', 'pink');
    expect(withoutOrder(state.draft.blocks)).toEqual(withoutOrder(before));
    expect((state.draft.blocks.find(b => b.id === story.id)!.data as any).content).toBe('<p>כתבתי</p>');
  });

  it('initial creation keeps using applyTemplate: a fresh draft with the template starter blocks', () => {
    state.applyPreset('race');
    const t = template('story-first');
    state.applyTemplate(t.createBlocks(palette('teal')), t.buildTheme(palette('teal')), t.layoutMode, t.id, t.heroPlacement, t.pageFormat);
    expect(state.draft.layout.templateId).toBe('story-first');
    expect(state.draft.layout.preset).toBe('race');
  });
});

describe('Template switching — page formats', () => {
  let state: CampaignStudioStateService;
  beforeEach(() => { state = TestBed.inject(CampaignStudioStateService); state.loadDraft(structuredClone(existingCampaign(state))); });

  it('refuses to switch a full page to the minimal donation format, leaving the draft untouched', () => {
    const before = structuredClone(state.draft);
    expect(apply(state, 'minimal-donation')).toBeFalse();
    expect(state.draft).toEqual(before);
  });

  it('refuses to switch a minimal donation page to a full template, leaving the draft untouched', () => {
    state.patch({ layout: { ...state.draft.layout, pageFormat: 'minimal' } });
    const before = structuredClone(state.draft);
    expect(apply(state, 'classic')).toBeFalse();
    expect(state.draft).toEqual(before);
  });
});

describe('Template switching — Step 9 and saving', () => {
  it('Step 9 "שנה תבנית" switches non-destructively instead of rebuilding the draft', () => {
    TestBed.configureTestingModule({ imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    const state = TestBed.inject(CampaignStudioStateService);
    const original = existingCampaign(state);
    state.loadDraft(structuredClone(original));
    const step = TestBed.createComponent(CampaignPageBuilderStepComponent).componentInstance;
    spyOn(state, 'applyTemplate').and.callThrough();
    step.onTemplateSelected({ template: template('magazine'), palette: palette('pink') });
    expect(state.applyTemplate).not.toHaveBeenCalled();
    expect(state.draft.id).toBe('campaign-42');
    expect(withoutOrder(state.draft.blocks)).toEqual(withoutOrder(original.blocks));
    expect(state.draft.layout.templateId).toBe('magazine');
    expect(step.showTemplatePicker).toBeFalse();
  });

  it('saving after switching updates the existing campaign and never creates a new one', () => {
    const api = { update: jasmine.createSpy('update').and.returnValue(of({ id: 'campaign-42' })), create: jasmine.createSpy('create') };
    TestBed.configureTestingModule({
      imports: [CampaignStudioTopbarComponent, HttpClientTestingModule],
      providers: [provideRouter([]), { provide: CampaignApiService, useValue: api },
        { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'entity-7' }) } }],
    });
    const state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft(structuredClone(existingCampaign(state)));
    apply(state, 'sidebar-right-hero-column');
    apply(state, 'large-hero');
    TestBed.createComponent(CampaignStudioTopbarComponent).componentInstance.saveDraft();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).toHaveBeenCalledTimes(1);
    const [id, saved] = api.update.calls.mostRecent().args;
    expect(id).toBe('campaign-42');
    expect(saved.entityId).toBe('entity-7');
    expect(saved.blocks.length).toBe(8);
  });
});

describe('Template switching — template picker', () => {
  it('switch mode hides the minimal page format; create mode lists every template', () => {
    const picker = new TemplatePickerComponent();
    expect(picker.templates.length).toBe(CAMPAIGN_TEMPLATES.length);
    picker.mode = 'switch';
    expect(picker.templates.some(t => t.pageFormat === 'minimal')).toBeFalse();
    expect(picker.templates.length).toBe(CAMPAIGN_TEMPLATES.length - 1);
  });
});
