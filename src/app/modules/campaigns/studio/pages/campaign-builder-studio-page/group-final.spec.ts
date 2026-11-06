import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CampaignBuilderStudioPageComponent, blockActions } from './campaign-builder-studio-page.component';
import { CampaignBlock, CampaignDraft, CampaignStudioStateService, ContainerBlockData } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { SINGLE_INSTANCE } from '../../../builder/block-catalog';
import { CAMPAIGN_TEMPLATES, TEMPLATE_PALETTES } from '../../../builder/templates/campaign-templates';
import { HISTORY_SETTLE_MS, StudioHistory } from '../../canvas/studio-history';

const blocks = (): CampaignBlock[] => [
  { id: 'hero-1', type: 'hero', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} as any },
  { id: 'box-1', type: 'container', order: 1, visible: true, label: 'מסגרת', spacingTop: 0, spacingBottom: 0,
    data: { childBlockIds: ['story-1', 'inner-1'], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 16, direction: 'column' } as any },
  { id: 'story-1', type: 'rich-text', order: 0, visible: true, label: 'סיפור', spacingTop: 0, spacingBottom: 0, data: { content: '<p>א</p>' } as any },
  { id: 'inner-1', type: 'container', order: 1, visible: true, label: 'פנימית', spacingTop: 0, spacingBottom: 0,
    data: { childBlockIds: ['img-1'], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 16, direction: 'column' } as any },
  { id: 'img-1', type: 'image', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { url: 'https://example.com/a.jpg', caption: '' } as any },
  { id: 'rewards-1', type: 'rewards', order: 2, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} as any },
];

async function setup(overrides: Partial<CampaignDraft> | ((d: CampaignDraft) => Partial<CampaignDraft>) = {}, id = 'c-1') {
  const api = { getById: jasmine.createSpy('getById'), update: jasmine.createSpy('update'), create: jasmine.createSpy('create') };
  await TestBed.configureTestingModule({
    imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule],
    providers: [
      provideRouter([]),
      { provide: CampaignApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}), queryParamMap: convertToParamMap({}) } } },
      { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1', status: 'active' }) } },
    ],
  }).compileComponents();
  const state = TestBed.inject(CampaignStudioStateService);
  api.getById.and.returnValue(of({ ...state.draft, id: 'c-1', entityId: 'e-1', status: 'draft', title: 'קמפיין', blocks: blocks(), ...(typeof overrides === 'function' ? overrides(state.draft) : overrides) }));
  const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
  fixture.detectChanges();
  fixture.detectChanges();
  return { fixture, state, api, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

const children = (d: CampaignDraft, id: string) => (d.blocks.find(b => b.id === id)!.data as ContainerBlockData).childBlockIds;

describe('Studio final sprint — undo / redo', () => {
  it('coalesces a burst of edits into one step and restores nested block changes', async () => {
    const { state, page } = await setup();
    state.patch({ title: 'א' }); state.patch({ title: 'אב' }); state.patch({ title: 'אבג' });
    page.history.commit();
    state.moveBlockTo('img-1', null, 0);
    page.history.commit();
    expect(children(state.draft, 'inner-1')).toEqual([]);

    page.undo();
    expect(children(state.draft, 'inner-1')).toEqual(['img-1']);
    expect(state.draft.title).toBe('אבג');
    page.undo();
    expect(state.draft.title).toBe('קמפיין');
    expect(page.history.canUndo).toBeFalse();

    page.redo(); page.redo();
    expect(state.draft.title).toBe('אבג');
    expect(children(state.draft, 'inner-1')).toEqual([]);
    page.history.stop();
  });

  it('captures in-place edits from wizard steps (deep snapshots)', async () => {
    const { state, page } = await setup();
    (state.draft.blocks.find(b => b.id === 'story-1')!.data as any).content = '<p>שונה</p>';
    state.patch({});
    page.history.commit();
    page.undo();
    expect((state.draft.blocks.find(b => b.id === 'story-1')!.data as any).content).toBe('<p>א</p>');
    page.history.stop();
  });

  it('never restores server fields: undo after a save keeps the id and status', async () => {
    const { state, page } = await setup();
    state.patch({ title: 'חדש' });
    page.history.commit();
    state.patch({ id: 'saved-9', status: 'published' } as any);
    page.undo();
    expect(state.draft.title).toBe('קמפיין');
    expect(state.draft.id).toBe('saved-9');
    expect(state.draft.status).toBe('published');
    page.history.stop();
  });

  it('a new edit clears redo; no-op changes add no step; limit and restart', async () => {
    const { state, page } = await setup();
    state.patch({ title: 'x' }); page.history.commit();
    page.undo();
    expect(page.history.canRedo).toBeTrue();
    state.patch({ title: 'y' }); page.history.commit();
    expect(page.history.canRedo).toBeFalse();
    state.patch({ title: 'y' }); page.history.commit();
    page.undo();
    expect(state.draft.title).toBe('קמפיין');
    page.history.start();
    expect(page.history.canUndo).toBeFalse();
    page.history.stop();
  });

  it('keyboard: Ctrl+Z undoes outside fields, but not while typing in an input', async () => {
    const { state, page } = await setup();
    state.patch({ title: 'x' }); page.history.commit();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(state.draft.title).toBe('x');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(state.draft.title).toBe('קמפיין');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
    expect(state.draft.title).toBe('x');
    input.remove();
    page.history.stop();
  });

  it('undo that removes the selected block falls back to the opening area', async () => {
    const { state, page } = await setup();
    page.runAction('duplicate', state.draft.blocks.find(b => b.id === 'story-1')!);
    const copyId = page.selectedKey!;
    expect(copyId).not.toBe('story-1');
    page.history.commit();
    page.undo();
    expect(state.draft.blocks.some(b => b.id === copyId)).toBeFalse();
    expect(page.selectedKey).toBe('area:opening');
    page.history.stop();
  });
});

describe('Studio final sprint — duplicate block', () => {
  it('copies a nested container with new ids, right after the original, inside the same parent', async () => {
    const { state } = await setup();
    const newId = state.duplicateBlock('inner-1', SINGLE_INSTANCE)!;
    const d = state.draft;
    expect(children(d, 'box-1')).toEqual(['story-1', 'inner-1', newId]);
    const copy = d.blocks.find(b => b.id === newId)!;
    expect(copy.order).toBe(3);
    expect(d.blocks.find(b => b.id === 'inner-1')!.order).toBe(2);
    const copyKids = (copy.data as ContainerBlockData).childBlockIds;
    expect(copyKids.length).toBe(1);
    expect(copyKids[0]).not.toBe('img-1');
    expect(d.blocks.find(b => b.id === copyKids[0])!.type).toBe('image');
    expect(children(d, 'inner-1')).toEqual(['img-1']);
    expect(d.blocks.length).toBe(8);
  });

  it('top-level duplicate goes after the original; single-instance types are not offered or duplicated', async () => {
    const { state } = await setup();
    const newId = state.duplicateBlock('box-1', SINGLE_INSTANCE)!;
    const top = state.draft.blocks.filter(b => ['hero-1', 'box-1', newId, 'rewards-1'].includes(b.id)).sort((a, b) => a.order - b.order).map(b => b.id);
    expect(top).toEqual(['hero-1', 'box-1', newId, 'rewards-1']);
    expect(state.duplicateBlock('rewards-1', SINGLE_INSTANCE)).toBeNull();
    expect(state.duplicateBlock('hero-1', SINGLE_INSTANCE)).toBeNull();
    expect(blockActions(state.draft.blocks.find(b => b.id === 'hero-1')!).some(a => a.id === 'duplicate')).toBeFalse();
    expect(blockActions(state.draft.blocks.find(b => b.id === 'story-1')!).some(a => a.id === 'duplicate')).toBeTrue();
  });

  it('the donation box and the stats bar cannot be duplicated, directly or through their container', async () => {
    const block = (id: string, type: string, extra: any = {}) =>
      ({ id, type, order: 3, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {}, ...extra }) as CampaignBlock;
    const { state, page } = await setup({
      blocks: [
        ...blocks(),
        block('rail-1', 'container', { data: { childBlockIds: ['stats-1', 'donate-1'], direction: 'row' } }),
        block('stats-1', 'stats', { data: { items: [] } }),
        block('donate-1', 'donation-widget'),
      ],
    });
    const count = state.draft.blocks.length;
    for (const id of ['stats-1', 'donate-1', 'rail-1']) {
      const b = state.draft.blocks.find(x => x.id === id)!;
      expect(page.actionsFor(b).some(a => a.id === 'duplicate')).withContext(id).toBeFalse();
      expect(state.duplicateBlock(id, SINGLE_INSTANCE)).withContext(id).toBeNull();
    }
    expect(state.draft.blocks.length).toBe(count);
    expect(page.actionsFor(state.draft.blocks.find(b => b.id === 'inner-1')!).some(a => a.id === 'duplicate')).toBeTrue();
    expect(page.isAlreadyAdded('donation-widget', state.draft.blocks)).toBeTrue();
    expect(page.isAlreadyAdded('stats', state.draft.blocks)).toBeTrue();
  });
});

describe('Studio final sprint — unsaved changes', () => {
  it('a loaded campaign is clean; edits make it dirty; a successful save through the API clears it', async () => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const state = TestBed.inject(CampaignStudioStateService);
    const api = TestBed.inject(CampaignApiService);
    const http = TestBed.inject(HttpTestingController);
    state.loadDraft({ ...state.draft, id: 'c-1', title: 'א' });
    expect(state.hasUnsavedChanges()).toBeFalse();
    state.patch({ title: 'ב' });
    expect(state.hasUnsavedChanges()).toBeTrue();
    state.patch({ currentAmount: 500 } as any);
    api.update('c-1', state.draft).subscribe();
    expect(state.hasUnsavedChanges()).toBeTrue();
    http.expectOne(r => r.method === 'PATCH').flush({ id: 'c-1' });
    expect(state.hasUnsavedChanges()).toBeFalse();
    state.patch({ title: 'ג' });
    api.update('c-1', state.draft).subscribe({ error: () => {} });
    http.expectOne(r => r.method === 'PATCH').flush({}, { status: 500, statusText: 'x' });
    expect(state.hasUnsavedChanges()).toBeTrue();
    http.verify();
  });

  it('the leave guard asks only when there are unsaved edits', async () => {
    const { state, page } = await setup();
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    expect(page.canLeave()).toBeTrue();
    expect(confirmSpy).not.toHaveBeenCalled();
    state.patch({ title: 'שונה' });
    expect(page.canLeave()).toBeFalse();
    confirmSpy.and.returnValue(true);
    expect(page.canLeave()).toBeTrue();
    page.history.stop();
  });
});

describe('Studio final sprint — canvas areas', () => {
  it('canvas area clicks open opening / design / footer, and the selection is outlined', async () => {
    const { fixture, state, page, el } = await setup();
    state.requestFocusArea('footer');
    fixture.detectChanges();
    expect(page.selectedKey).toBe('area:footer');
    const footer = el.querySelector('.canvas-frame [data-studio-area="footer"]');
    if (footer) expect(footer.classList.contains('studio-selected')).toBeTrue();
    state.requestFocusArea('nav');
    expect(page.selectedKey).toBe('area:design');
    state.requestFocusArea('opening');
    expect(page.selectedKey).toBe('area:opening');
    page.history.stop();
  });

  it('clicking the rendered footer in the canvas selects the footer area', async () => {
    const { fixture, page, el } = await setup();
    const footer = el.querySelector<HTMLElement>('.canvas-frame footer.hm-footer');
    expect(footer).not.toBeNull();
    expect(footer!.getAttribute('data-studio-area')).toBe('footer');
    footer!.click();
    fixture.detectChanges();
    expect(page.selectedKey).toBe('area:footer');
    page.history.stop();
  });
});

describe('Studio final sprint — minimal donation page', () => {
  it('opens in the Studio with its own details step, canvas and only the wizard steps it keeps', async () => {
    const { page, el: root } = await setup(d => ({ layout: { ...d.layout, pageFormat: 'minimal' } }));
    expect(root.querySelector('.canvas-frame app-minimal-donation-page')).not.toBeNull();
    expect(root.querySelector('.canvas-frame app-campaign-preview')).toBeNull();
    expect(root.querySelector('app-campaign-minimal-details-step')).not.toBeNull();
    const labels = Array.from(root.querySelectorAll('.tree-row .tree-label')).map(n => n.textContent!.trim());
    expect(labels).toEqual(['פרטי דף התרומה', 'סוג, יעד ותאריכים', 'הגדרות תרומה']);
    expect(root.querySelector('.panel-footer .add-btn')).toBeNull();
    page.history.stop();
  });

  it('the preset picker minimal choice starts a minimal page in the Studio (no navigation away)', async () => {
    const { state, page } = await setup({}, '');
    expect(page.isNew).toBeTrue();
    page.onMinimalSelected();
    expect(state.draft.layout.pageFormat).toBe('minimal');
    expect(page.showPresetPicker).toBeFalse();
    expect(page.isSupported(state.draft)).toBeTrue();
    const template = CAMPAIGN_TEMPLATES.find(t => t.id === 'minimal-donation')!;
    expect(template).toBeDefined();
    expect(TEMPLATE_PALETTES.length).toBeGreaterThan(0);
    page.history.stop();
  });

  it('partner pages stay out of the Studio', async () => {
    const { page, state } = await setup({ ownerType: 'partner' } as any);
    expect(page.isSupported(state.draft)).toBeFalse();
  });
});

describe('Studio final sprint — StudioHistory unit', () => {
  it('keeps at most the history limit', () => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const state = TestBed.inject(CampaignStudioStateService);
    state.loadDraft({ ...state.draft, title: '0' });
    const h = new StudioHistory(state);
    h.start();
    for (let i = 1; i <= 60; i++) { state.patch({ title: String(i) }); h.commit(); }
    let n = 0;
    while (h.canUndo) { h.undo(); n++; }
    expect(n).toBe(50);
    expect(state.draft.title).toBe('10');
    h.stop();
  });

  it('settles a burst of edits into one step after the pause', () => {
    jasmine.clock().install();
    try {
      TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
      const state = TestBed.inject(CampaignStudioStateService);
      state.loadDraft({ ...state.draft, title: '0' });
      const h = new StudioHistory(state);
      h.start();
      state.patch({ title: '1' });
      jasmine.clock().tick(HISTORY_SETTLE_MS - 100);
      state.patch({ title: '12' });
      jasmine.clock().tick(HISTORY_SETTLE_MS - 100);
      expect(h.canRedo).toBeFalse();
      jasmine.clock().tick(200);
      h.undo();
      expect(state.draft.title).toBe('0');
      expect(h.canUndo).toBeFalse();
      h.stop();
    } finally { jasmine.clock().uninstall(); }
  });
});
