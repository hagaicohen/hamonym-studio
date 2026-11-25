import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { CampaignBuilderStudioPageComponent } from './campaign-builder-studio-page.component';
import { CampaignDraft, CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { CampaignEditorComponent } from '../../editor/campaign-editor/campaign-editor.component';
import { CampaignTypeStepComponent } from '../../../builder/steps/campaign-type-step/campaign-type-step.component';
import { CampaignDonationStepComponent } from '../../../builder/steps/campaign-donation-step/campaign-donation-step.component';
import { disabledWizardSteps, wizardStepAccess } from '../../../builder/wizard-steps';

// Group E, increment 1 (2026-11-05): shared wizard step rules and steps 2–3
// hosted in the Studio. The Studio must behave exactly like the wizard.

type Combo = { lifecycle: 'one-time' | 'ongoing'; format: 'full' | 'minimal'; status: 'draft' | 'published' };
const combos: Combo[] = [];
for (const lifecycle of ['one-time', 'ongoing'] as const)
  for (const format of ['full', 'minimal'] as const)
    for (const status of ['draft', 'published'] as const) combos.push({ lifecycle, format, status });

// The wizard's rules as they were before the move (campaign-editor, 2026-11-04).
function legacyDisabled(c: Combo): number[] {
  const gated = new Set<number>();
  if (c.lifecycle === 'ongoing') gated.add(5);
  if (c.format === 'minimal') [4, 5, 6, 7, 8, 9].forEach(s => gated.add(s));
  if (c.status !== 'draft') [3, 4, 5, 6, 7, 8].forEach(s => gated.add(s));
  return [...gated];
}

function draftFor(state: CampaignStudioStateService, c: Combo, extra: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    ...state.draft, id: 'c-1', entityId: 'e-1', title: 'קמפיין', status: c.status,
    campaignLifecycle: c.lifecycle, fundingType: c.lifecycle === 'ongoing' ? 'recurring' : 'flexible',
    targetAmount: 20000, startDate: '2026-11-01', endDate: '2026-12-01',
    layout: { ...state.draft.layout, pageFormat: c.format },
    ...extra,
  };
}

const providers = (api: any = { getById: () => of(null) }) => [
  provideRouter([]),
  { provide: CampaignApiService, useValue: api },
  { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c-1' }), queryParamMap: convertToParamMap({}) } } },
  { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1', status: 'active' }) } },
  { provide: EntitiesService, useValue: { getEntityById: () => of({}) } },
];

describe('Wizard step rules (shared by the wizard and the Studio)', () => {
  it('match the previous wizard rules for every combination', () => {
    TestBed.configureTestingModule({});
    const state = TestBed.inject(CampaignStudioStateService);
    for (const c of combos) {
      expect(disabledWizardSteps(draftFor(state, c))).withContext(JSON.stringify(c)).toEqual(legacyDisabled(c));
    }
  });

  it('the classic editor reads them unchanged', async () => {
    await TestBed.configureTestingModule({ imports: [CampaignEditorComponent, HttpClientTestingModule], providers: providers() }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    const editor = TestBed.createComponent(CampaignEditorComponent).componentInstance;
    for (const c of combos) {
      state.loadDraft(draftFor(state, c));
      expect(editor.disabledSteps).withContext(JSON.stringify(c)).toEqual(legacyDisabled(c));
    }
  });

  it('access: edit, Workspace for published steps 3–8, hidden for ongoing registration and minimal steps', () => {
    TestBed.configureTestingModule({});
    const state = TestBed.inject(CampaignStudioStateService);
    const access = (c: Combo, step: number) => wizardStepAccess(draftFor(state, c), step);
    expect(access({ lifecycle: 'one-time', format: 'full', status: 'draft' }, 3)).toBe('edit');
    expect(access({ lifecycle: 'one-time', format: 'full', status: 'published' }, 3)).toBe('workspace');
    expect(access({ lifecycle: 'one-time', format: 'full', status: 'published' }, 2)).toBe('edit');
    expect(access({ lifecycle: 'ongoing', format: 'full', status: 'draft' }, 5)).toBe('hidden');
    expect(access({ lifecycle: 'ongoing', format: 'full', status: 'published' }, 5)).toBe('hidden');
    expect(access({ lifecycle: 'one-time', format: 'minimal', status: 'draft' }, 4)).toBe('hidden');
    expect(access({ lifecycle: 'one-time', format: 'full', status: 'published' }, 9)).toBe('edit');
    for (const c of combos) for (let step = 1; step <= 10; step++) {
      expect(access(c, step) === 'edit').withContext(JSON.stringify(c) + ' step ' + step).toBe(!legacyDisabled(c).includes(step));
    }
  });
});

describe('Studio — steps 2–3 areas', () => {
  async function open(c: Combo) {
    await TestBed.configureTestingModule({ imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule], providers: providers({
      getById: () => of(draftFor(TestBed.inject(CampaignStudioStateService), c)), update: jasmine.createSpy('update'), create: jasmine.createSpy('create'),
    }) }).compileComponents();
    const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
    fixture.detectChanges(); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('draft: both areas host the wizard steps as-is', async () => {
    const { fixture, page, el } = await open({ lifecycle: 'one-time', format: 'full', status: 'draft' });
    page.select('area:settings'); fixture.detectChanges();
    expect(el.querySelector('.props-panel app-campaign-type-step')).not.toBeNull();
    page.select('area:donation'); fixture.detectChanges();
    expect(el.querySelector('.props-panel app-campaign-donation-step')).not.toBeNull();
    expect(el.querySelector('.props-panel .props-link')).toBeNull();
  });

  it('published: settings stay editable, donation settings link to the Workspace page and are not editable here', async () => {
    const { fixture, page, el } = await open({ lifecycle: 'one-time', format: 'full', status: 'published' });
    page.select('area:settings'); fixture.detectChanges();
    expect(el.querySelector('.props-panel app-campaign-type-step')).not.toBeNull();
    page.select('area:donation'); fixture.detectChanges();
    expect(el.querySelector('.props-panel app-campaign-donation-step')).toBeNull();
    expect(el.querySelector('.props-panel .props-link')!.getAttribute('href')).toBe('/campaigns/c-1/donation');
    const row = Array.from(el.querySelectorAll('.tree-row')).find(r => r.textContent!.includes('הגדרות תרומה'))!;
    expect(row.querySelector('.tree-workspace')).not.toBeNull();
  });

  it('saving an incomplete draft stays possible: no new save-time validation', async () => {
    const api = { getById: () => of(null), update: jasmine.createSpy('update').and.returnValue(of({ id: 'c-1' })), create: jasmine.createSpy('create') };
    await TestBed.configureTestingModule({ imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule], providers: providers(api) }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    const incomplete = draftFor(state, { lifecycle: 'one-time', format: 'full', status: 'draft' }, { title: '', targetAmount: 0, startDate: '2026-12-01', endDate: '2026-11-01' });
    (api as any).getById = () => of(incomplete);
    const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
    fixture.detectChanges(); fixture.detectChanges();
    fixture.componentInstance.select('area:settings'); fixture.detectChanges();
    const topbar = fixture.debugElement.query(By.css('app-campaign-studio-topbar')).componentInstance;
    topbar.saveDraft();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update.calls.mostRecent().args[1].targetAmount).toBe(0);
  });
});

describe('Studio vs wizard — identical inputs, identical draft and API payload (steps 2–3)', () => {
  type Step2 = CampaignTypeStepComponent;
  type Step3 = CampaignDonationStepComponent;
  const step2Scenarios: { name: string; race?: boolean; run: (c: Step2) => void }[] = [
    { name: 'one-time → ongoing → one-time, answer race, target and model',
      run: c => { c.selectLifecycle('ongoing'); c.selectLifecycle('one-time'); c.confirmMakeRace(); c.onTargetChange('75,000'); c.selectType('matching'); } },
    { name: 'race preset blocks ongoing; drop race and go ongoing', race: true,
      run: c => { c.selectLifecycle('ongoing'); c.dropRaceForOngoing(); c.onTargetChange('5000'); } },
    { name: 'race preset blocks ongoing; keep one-time', race: true,
      run: c => { c.selectLifecycle('ongoing'); c.keepOneTimeForRace(); c.selectType('all-or-nothing'); } },
  ];
  const step3Scenarios: { name: string; run: (c: Step3) => void }[] = [
    { name: 'amounts: add up to the limit, edit, remove, invalid value', run: c => {
      for (let i = 0; i < 8; i++) c.addAmount();
      c.updateAmount(0, 0); c.updateAmount(1, 360); c.removeAmount(2);
    } },
    { name: 'monthly giving, monthly amounts, fixed installments, invalid count', run: c => {
      c.patchDraft({ allowMonthlyDonation: true, recurringBillingMode: 'fixed_installments' });
      c.addMonthlyAmount(); c.updateMonthlyAmount(0, -5); c.updateInstallmentsCount(0); c.updateInstallmentsCount(12);
      c.patchDraft({ allowCustomAmount: false, enableSuggestedAmounts: false });
    } },
  ];

  async function harness() {
    await TestBed.configureTestingModule({ imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule], providers: providers() }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    return { state, http: TestBed.inject(HttpTestingController) };
  }

  // The request body the real CampaignApiService would send for this draft.
  function payload(draft: CampaignDraft, http: HttpTestingController): unknown {
    return TestBed.runInInjectionContext(() => {
      const real = new CampaignApiService();
      real.update(draft.id!, draft).subscribe();
      const req = http.expectOne(r => r.method === 'PATCH');
      const body = req.request.body;
      req.flush({});
      return body;
    });
  }

  function viaWizard<T>(state: CampaignStudioStateService, start: CampaignDraft, component: new (...a: any[]) => T, run: (c: T) => void): CampaignDraft {
    state.loadDraft(structuredClone(start));
    const fixture = TestBed.createComponent(component as any);
    fixture.detectChanges();
    run(fixture.componentInstance as T);
    fixture.destroy();
    return structuredClone(state.draft);
  }

  function viaStudio<T>(state: CampaignStudioStateService, start: CampaignDraft, area: string, component: new (...a: any[]) => T, run: (c: T) => void): CampaignDraft {
    const api = TestBed.inject(CampaignApiService) as any;
    api.getById = () => of(structuredClone(start));
    const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
    fixture.detectChanges(); fixture.detectChanges();
    fixture.componentInstance.select(area); fixture.detectChanges();
    const hosted = fixture.debugElement.query(By.directive(component as any)).componentInstance as T;
    run(hosted);
    fixture.detectChanges();
    const result = structuredClone(state.draft);
    fixture.destroy();
    return result;
  }

  for (const sc of step2Scenarios) {
    it('step 2: ' + sc.name, async () => {
      const { state, http } = await harness();
      const base = draftFor(state, { lifecycle: 'one-time', format: 'full', status: 'draft' });
      const start = sc.race ? { ...base, layout: { ...base.layout, preset: 'race' as const } } : base;
      const wizard = viaWizard(state, start, CampaignTypeStepComponent, sc.run);
      const studio = viaStudio(state, start, 'area:settings', CampaignTypeStepComponent, sc.run);
      expect(studio).toEqual(wizard);
      expect(payload(studio, http)).toEqual(payload(wizard, http));
    });
  }

  for (const sc of step3Scenarios) {
    it('step 3: ' + sc.name, async () => {
      const { state, http } = await harness();
      const start = draftFor(state, { lifecycle: 'one-time', format: 'full', status: 'draft' });
      const wizard = viaWizard(state, start, CampaignDonationStepComponent, sc.run);
      const studio = viaStudio(state, start, 'area:donation', CampaignDonationStepComponent, sc.run);
      expect(studio).toEqual(wizard);
      expect(payload(studio, http)).toEqual(payload(wizard, http));
      expect(wizard.suggestedAmounts.length).toBeLessThanOrEqual(6);
    });
  }
});
