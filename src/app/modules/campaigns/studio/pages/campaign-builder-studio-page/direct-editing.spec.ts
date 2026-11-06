import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CampaignBuilderStudioPageComponent } from './campaign-builder-studio-page.component';
import { CampaignDraft, CampaignStudioStateService, ContainerBlockData } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { CampaignPreviewComponent } from '../../preview/campaign-preview/campaign-preview.component';
import { TextStyleEditorComponent } from '../../../../../shared/ui/text-style-editor/text-style-editor.component';

// Direct editing: whatever is visible on the canvas opens its own editor with
// one click, and canvas clicks select instead of running public-page actions.

async function setup(overrides: (d: CampaignDraft) => Partial<CampaignDraft> = () => ({})) {
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
    ...state.draft, id: 'c-1', entityId: 'e-1', status: 'draft', title: 'כותרת הקמפיין', shortDescription: 'משפט קצר', slug: '',
    targetAmount: 1000, heroCtaConfig: { ...state.draft.heroCtaConfig, visible: true, label: 'לתרומה' },
    ...overrides(state.draft),
  }));
  const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
  fixture.detectChanges();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector(sel) as T;
  const click = (target: HTMLElement) => { target.click(); fixture.detectChanges(); fixture.detectChanges(); };
  const props = () => q('.props-panel .panel-body');
  return { fixture, state, page: fixture.componentInstance, el, q, click, props };
}

const blockOfType = (d: CampaignDraft, type: string) => d.blocks.find(b => b.type === type)!;

describe('Studio direct editing — one click opens the element’s own editor', () => {
  it('clicking the title selects it, outlines it, marks it in the tree and opens its typography right away', async () => {
    const { page, q, click, props } = await setup();
    click(q('.canvas-frame [data-studio-part="title"]'));
    expect(page.selectedKey).toBe('part:title');
    expect(q('.canvas-frame [data-studio-part="title"]').classList).toContain('studio-selected');
    expect(q('.tree-row--part.is-selected').textContent).toContain('כותרת');
    expect(props().querySelector('h3')!.textContent).toContain('כותרת');
    expect(q<HTMLInputElement>('#studio-part-text-title').value).toBe('כותרת הקמפיין');
    expect(props().querySelector('.tse-toggle-row')).withContext('no "עיצוב מתקדם" step').toBeNull();
    expect(props().querySelector('.tse-body--part')).not.toBeNull();
    expect(props().querySelectorAll('.part-chip').length).withContext('position: above / Hero / below / hidden').toBe(4);
  });

  it('size, color, alignment and text edited there apply to the canvas immediately', async () => {
    const { state, q, click, props, fixture } = await setup();
    click(q('.canvas-frame [data-studio-part="title"]'));
    const xl = Array.from(props().querySelectorAll<HTMLButtonElement>('.tse-chip--size')).find(b => b.textContent!.trim() === 'XL')!;
    click(xl);
    expect(state.draft.heroTextStyle.titleFontSize).toBe('xl');
    const left = Array.from(props().querySelectorAll<HTMLButtonElement>('.tse-chip')).find(b => b.textContent!.trim() === 'שמאל')!;
    click(left);
    expect(state.draft.heroTextStyle.titleAlign).toBe('left');
    expect(q('.canvas-frame .hm-hero-title').style.textAlign).toBe('left');

    const input = q<HTMLInputElement>('#studio-part-text-title');
    input.value = 'שם חדש';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(q('.canvas-frame .hm-hero-title').textContent).toContain('שם חדש');

    const above = Array.from(props().querySelectorAll<HTMLButtonElement>('.part-chip')).find(b => b.textContent!.trim() === 'מעל')!;
    click(above);
    expect(state.draft.layout.heroTitlePosition).toBe('above');
    expect(q('.canvas-frame .hm-hero-title-external.studio-selected')).withContext('selection follows the moved title').not.toBeNull();
  });

  it('the subtitle, the logo and the Hero button each open their own editor', async () => {
    const { page, q, click, props } = await setup();
    click(q('.canvas-frame [data-studio-part="subtitle"]'));
    expect(page.selectedKey).toBe('part:subtitle');
    expect(q<HTMLInputElement>('#studio-part-text-subtitle').value).toBe('משפט קצר');

    click(q('.canvas-frame [data-studio-part="logo"]'));
    expect(page.selectedKey).toBe('area:logo');
    expect(q('.canvas-frame [data-studio-part="logo"]').classList).toContain('studio-selected');

    click(q('.canvas-frame [data-studio-part="hero-cta"] button'));
    expect(page.selectedKey).toBe('part:hero-cta');
    expect(props().querySelector('.tse-input')).withContext('the button label field').not.toBeNull();
  });

  it('clicking the Hero background still opens the opening (image, video and details)', async () => {
    const { page, q, click } = await setup();
    page.select('part:title');
    click(q('.canvas-frame .hm-hero-bg-layer'));
    expect(page.selectedKey).toBe('area:opening');
  });

  it('a nested block is selected by itself, not its container', async () => {
    const { state, page, q, click } = await setup();
    const stats = blockOfType(state.draft, 'stats');
    click(q(`.canvas-frame [data-block-id="${stats.id}"] .hm-stats`));
    expect(page.selectedKey).toBe(stats.id);
    const container = blockOfType(state.draft, 'container');
    expect((container.data as ContainerBlockData).childBlockIds).toContain(stats.id);
  });

  it('the tree selects a part too, and the canvas follows', async () => {
    const { page, el, q, click } = await setup();
    click(Array.from(el.querySelectorAll<HTMLElement>('.tree-row--part')).find(r => r.textContent!.includes('תת-כותרת'))!);
    expect(page.selectedKey).toBe('part:subtitle');
    expect(q('.canvas-frame [data-studio-part="subtitle"]').classList).toContain('studio-selected');
  });
});

describe('Studio direct editing — canvas clicks select instead of acting', () => {
  it('the donate button selects the donation box and never opens checkout', async () => {
    const { state, page, fixture, q, click } = await setup();
    const preview = fixture.debugElement.query(p => p.componentInstance instanceof CampaignPreviewComponent).componentInstance as CampaignPreviewComponent;
    const donation = blockOfType(state.draft, 'donation-widget');
    click(q('.canvas-frame .hm-amount-preset'));
    const cta = q('.canvas-frame .hm-primary-donate-cta');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    cta.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBeTrue();
    expect(preview.checkoutOpen).toBeFalse();
    expect(page.selectedKey).toBe(donation.id);
  });

  it('links on the canvas do not navigate', async () => {
    const { fixture, q } = await setup();
    const link = document.createElement('a');
    link.href = '/somewhere';
    q('.canvas-frame .hm-hero-title').appendChild(link);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBeTrue();
  });

  it('the Studio’s own canvas controls keep working (hide ×)', async () => {
    const { state, q, click } = await setup();
    click(q('.canvas-frame [data-studio-part="title"] > .hm-hero-part-hide'));
    expect(state.draft.layout.heroTitlePosition).toBe('hidden');
  });

  it('the public page keeps its normal clicks', () => {
    TestBed.configureTestingModule({ imports: [CampaignPreviewComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    const state = TestBed.inject(CampaignStudioStateService);
    state.patch({ title: 'כותרת', slug: '' });
    state.setPageBuilderActive(false);
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.detectChanges();
    const cta = (fixture.nativeElement as HTMLElement).querySelector('.hm-primary-donate-cta') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    cta.dispatchEvent(event);
    expect(event.defaultPrevented).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-studio-part]')).toBeNull();
  });
});

describe('Studio direct editing — floating toolbar', () => {
  const barButton = (el: HTMLElement, label: string) => el.querySelector<HTMLButtonElement>(`.float-bar [aria-label="${label}"]`)!;

  it('appears next to a selected title with alignment, size and hide', async () => {
    const { state, page, el, q, click } = await setup();
    click(q('.canvas-frame [data-studio-part="title"]'));
    const bar = q('.float-bar');
    expect(bar.style.visibility).toBe('visible');
    expect(barButton(el, 'יישור למרכז').getAttribute('aria-pressed')).toBe('true');

    click(barButton(el, 'יישור לימין'));
    expect(state.draft.heroTextStyle.titleAlign).toBe('right');
    const before = state.draft.heroTextStyle.titleFontSize || state.draft.heroTextStyle.fontSize;
    click(barButton(el, 'הגדלת הטקסט'));
    expect(state.draft.heroTextStyle.titleFontSize).not.toBe(before);

    click(barButton(el, 'הסתרה'));
    expect(state.draft.layout.heroTitlePosition).toBe('hidden');
    expect(page.selectedKey).toBe('area:opening');
  });

  it('on a block: move, hide and delete; no duplicate for the donation box', async () => {
    const { state, page, el, click } = await setup();
    const donation = blockOfType(state.draft, 'donation-widget');
    page.select(donation.id, false);
    click(el);
    expect(barButton(el, 'שכפול')).toBeNull();
    expect(barButton(el, 'הזזה למטה').disabled).toBeTrue();
    click(barButton(el, 'הזזה למעלה'));
    const container = blockOfType(state.draft, 'container');
    const rowChildren = page.tree(state.draft).find(n => n.key === container.id)!.children.map(c => c.key);
    expect(rowChildren[0]).withContext('same reorder as the tree arrows').toBe(donation.id);
    click(barButton(el, 'הסתרה'));
    expect(state.draft.blocks.find(b => b.id === donation.id)!.visible).toBeFalse();
    click(barButton(el, 'מחיקה'));
    expect(page.pendingDelete?.id).withContext('delete still asks first').toBe(donation.id);
  });

  it('moving the logo from the toolbar uses the existing logo position', async () => {
    const { state, el, q, click } = await setup();
    click(q('.canvas-frame [data-studio-part="logo"]'));
    click(barButton(el, 'יישור לימין'));
    expect(state.draft.heroLogoPosition).toBe('right');
  });

  it('no toolbar without a canvas selection', async () => {
    const { page, q, fixture } = await setup();
    page.select('area:settings');
    fixture.detectChanges();
    expect(q('.float-bar')).toBeNull();
  });
});

describe('Text style editor — one part', () => {
  it('shows only that part, open, and aligns that part only', () => {
    const fixture = TestBed.createComponent(TextStyleEditorComponent);
    const editor = fixture.componentInstance;
    editor.part = 'subtitle';
    editor.textStyle = { align: 'right', color: '#fff', fontSize: 'lg', position: 'center' };
    editor.partAlignFallback = 'center';
    let emitted: any;
    editor.textStyleChange.subscribe(v => (emitted = v));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.tse-toggle-row')).toBeNull();
    expect(root.querySelectorAll('.tse-row').length).toBe(3);
    expect(editor.partAlign()).toBe('center');
    editor.setPartAlign('left');
    expect(emitted.subtitleAlign).toBe('left');
    expect(emitted.align).toBe('right');
  });
});
