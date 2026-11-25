import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignPreviewComponent } from './campaign-preview.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { ConversionWidgetLayout } from '../../../builder/styles/campaign-styles';

describe('Donation widget layouts', () => {
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    state = TestBed.inject(CampaignStudioStateService);
    state.patch({
      title: 'קמפיין בדיקה', slug: '', targetAmount: 50000, currentAmount: 12500, supportersCount: 7,
      allowMonthlyDonation: true, monthlyAmounts: [50, 100], allowCustomAmount: true,
      offeringsEnabled: false, endDate: '2099-12-31',
    });
  });

  function render(layout?: ConversionWidgetLayout, extraLayout: Record<string, unknown> = {}) {
    state.patch({ layout: { ...state.draft.layout, conversionWidgetLayout: layout, ...extraLayout } });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, donate: el.querySelector('.hm-donate:not(.hm-register)') as HTMLElement };
  }

  function expectDonationBehaviorIntact(donate: HTMLElement) {
    expect(donate.querySelector('.hm-frequency-toggle')).withContext('frequency').not.toBeNull();
    expect(donate.querySelectorAll('.hm-amount-preset').length).withContext('preset amounts').toBeGreaterThan(0);
    expect(donate.querySelector('.hm-custom-amount')).withContext('custom amount').not.toBeNull();
    expect(donate.querySelector('.hm-primary-donate-cta')).withContext('CTA').not.toBeNull();
    expect(donate.querySelector('.hm-security-note')).withContext('secure payment').not.toBeNull();
  }

  it('an existing campaign (no layout chosen) keeps the classic look: separate stats block, no merged section', () => {
    const { el, donate } = render(undefined);
    expect(el.querySelector('.hm-stats')).not.toBeNull();
    expect(el.querySelector('.hm-stats-merged')).toBeNull();
    expect(donate.querySelector('.hm-donate-progress')).toBeNull();
    expect(donate.classList.contains('conv-merged')).toBeFalse();
    expectDonationBehaviorIntact(donate);
  });

  it('the earlier variants and Style defaults still render exactly as before', () => {
    const { el, donate } = render(undefined, { campaignStyleId: 'clean' });
    expect(el.querySelector('.hm-stats.conv-unified')).not.toBeNull();
    expect(donate.classList.contains('conv-unified')).toBeTrue();
    expect(donate.querySelector('.hm-donate-progress')).toBeNull();
  });

  for (const layout of ['compact-bar', 'conversion-first', 'modern'] as ConversionWidgetLayout[]) {
    it(`${layout}: one card with progress, remaining, supporters and days left, plus the full donation form`, () => {
      const { el, donate } = render(layout);
      expect(donate.classList).toContain('conv-merged');
      expect(donate.classList).toContain(`conv-${layout}`);
      const progress = donate.querySelector('.hm-donate-progress') as HTMLElement;
      expect(progress.textContent).toContain('₪12,500');
      expect(progress.textContent).toContain('נותר ליעד');
      expect(progress.textContent).toContain('תומכים');
      expect(progress.textContent).toContain('ימים נותרו');
      expectDonationBehaviorIntact(donate);

      expect(el.querySelector('.hm-stats')).withContext('stats not rendered twice').toBeNull();
      const marker = el.querySelector('.hm-stats-merged') as HTMLElement;
      expect(getComputedStyle(marker.parentElement!).display).withContext('empty stats wrapper dropped').toBe('none');
    });
  }

  it('compact puts a condensed summary with a horizontal bar first, right above the form', () => {
    const compact = render('compact-bar').donate;
    expect(compact.querySelector('.hm-dp-bar')).not.toBeNull();
    expect(compact.querySelector('.hm-dp-ring')).toBeNull();
    expect(compact.firstElementChild!.classList).toContain('hm-donate-progress');
    expect(getComputedStyle(compact.querySelector('.hm-donate-progress')!).order).toBe('0');
  });

  it('conversion-first moves progress after the CTA; modern turns it into a header band with a ring', () => {
    const conversion = render('conversion-first').donate;
    expect(getComputedStyle(conversion.querySelector('.hm-donate-progress')!).order).toBe('10');
    expect(getComputedStyle(conversion.querySelector('.hm-primary-donate-cta')!).order).toBe('0');

    const { fixture, donate } = render('modern');
    const band = donate.querySelector('.hm-donate-progress') as HTMLElement;
    expect(donate.querySelector('.hm-dp-ring')).not.toBeNull();
    expect(donate.querySelector('.hm-dp-bar')).toBeNull();
    expect(getComputedStyle(donate).paddingTop).toBe('0px');
    expect(getComputedStyle(band).backgroundImage).toContain('gradient');
    fixture.destroy();
  });

  it('the progress bar fills to the raised percentage', () => {
    const bar = render('compact-bar').donate.querySelector('.hm-dp-bar > span') as HTMLElement;
    expect(bar.style.width).toBe('25%');
    expect(bar.parentElement!.getAttribute('aria-valuenow')).toBe('25');
  });

  it('the live canvas follows a layout change immediately', () => {
    const { fixture, el } = render(undefined);
    state.patch({ layout: { ...state.draft.layout, conversionWidgetLayout: 'modern' } });
    fixture.detectChanges();
    expect(el.querySelector('.hm-donate.conv-modern .hm-donate-progress')).not.toBeNull();
    expect(el.querySelector('.hm-stats')).toBeNull();

    state.patch({ layout: { ...state.draft.layout, conversionWidgetLayout: 'classic' } });
    fixture.detectChanges();
    expect(el.querySelector('.hm-donate-progress')).toBeNull();
    expect(el.querySelector('.hm-stats')).not.toBeNull();
  });

  it('with no donation card on the page, the stats block keeps rendering on its own', () => {
    state.patch({ blocks: state.draft.blocks.map((b) => (b.type === 'donation-widget' ? { ...b, visible: false } : b)) });
    const { el } = render('modern');
    expect(el.querySelector('.hm-stats')).not.toBeNull();
    expect(el.querySelector('.hm-stats-merged')).toBeNull();
  });

  it('the KPIs follow the stats block’s own visibility settings', () => {
    state.patch({
      blocks: state.draft.blocks.map((b) => b.type !== 'stats' ? b : {
        ...b, data: { ...(b.data as any), items: (b.data as any).items.map((i: any) => ({ ...i, visible: i.key !== 'supporters' && i.visible })) },
      }),
    });
    const progress = render('compact-bar').donate.querySelector('.hm-donate-progress') as HTMLElement;
    expect(progress.textContent).not.toContain('תומכים');
  });
});

describe('Donation widget layouts — Studio picker and persistence', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
  });

  it('offers the four layouts, highlights the effective one and writes the choice to the draft', () => {
    const state = TestBed.inject(CampaignStudioStateService);
    const step = TestBed.createComponent(CampaignPageBuilderStepComponent).componentInstance;
    expect(step.donationLayoutOptions.map((o) => o.label)).toEqual(['קלאסי', 'קומפקטי', 'ממוקד המרה', 'מודרני']);
    expect(step.moreDonationLayoutOptions.map((o) => o.value)).toEqual(['unified', 'compact', 'hero', 'split-horizontal']);

    expect(step.effectiveDonationLayout()).toBe('classic');
    state.patch({ layout: { ...state.draft.layout, campaignStyleId: 'clean' } });
    expect(step.effectiveDonationLayout()).toBe('unified');

    step.setConversionWidgetLayout('conversion-first');
    expect(state.draft.layout.conversionWidgetLayout).toBe('conversion-first');
    expect(step.effectiveDonationLayout()).toBe('conversion-first');
  });

  it('the chosen layout survives save and reload through the existing layout JSON', () => {
    const api = TestBed.inject(CampaignApiService);
    const state = TestBed.inject(CampaignStudioStateService);
    const http = TestBed.inject(HttpTestingController);
    const draft = { ...state.draft, layout: { ...state.draft.layout, conversionWidgetLayout: 'modern' as const } };

    api.update('c-1', draft).subscribe();
    const save = http.expectOne((r) => r.method !== 'GET');
    expect(save.request.body.layout.conversionWidgetLayout).toBe('modern');
    save.flush({ ...save.request.body, id: 'c-1' });

    let reloaded: any;
    api.getById('c-1').subscribe((d) => (reloaded = d));
    http.expectOne((r) => r.method === 'GET').flush({ id: 'c-1', layout: save.request.body.layout });
    expect(reloaded.layout.conversionWidgetLayout).toBe('modern');
  });
});
