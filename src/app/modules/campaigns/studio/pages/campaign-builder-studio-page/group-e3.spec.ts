import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { CampaignBuilderStudioPageComponent } from './campaign-builder-studio-page.component';
import { CampaignDraft, CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CampaignPartnersService } from '../../../services/campaign-partners.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { CampaignPublishStepComponent } from '../../../builder/steps/campaign-publish-step/campaign-publish-step.component';
import { publishMissingFields } from '../../../builder/steps/campaign-publish-step/publish-readiness';

// Group E, increment 3 (2026-11-05): step 10 publishing in the Studio.

// Step 10's checks as they were before the move (campaign-publish-step, 2026-11-04).
function legacyMissing(d: CampaignDraft): string[] {
  const hasHero = d.heroType === 'image' ? !!d.coverImageUrl : !!d.videoUrl;
  const isMinimal = d.layout.pageFormat === 'minimal';
  const isOngoing = d.campaignLifecycle === 'ongoing';
  const missing: string[] = [];
  if (!d.title?.trim()) missing.push('שם הקמפיין');
  if (!d.slug?.trim()) missing.push('כתובת הקמפיין');
  if (!hasHero && !isMinimal) missing.push('תמונה / וידאו ראשי');
  if (!d.targetAmount) missing.push('יעד גיוס');
  if (!isOngoing && d.startDate && d.endDate && new Date(d.endDate) < new Date(d.startDate)) missing.push('טווח תאריכים תקין');
  return missing;
}

function ready(state: CampaignStudioStateService, extra: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    ...state.draft, id: 'c-1', entityId: 'e-1', status: 'draft', title: 'קמפיין מוכן', slug: 'ready-campaign',
    heroType: 'image', coverImageUrl: 'https://example.com/cover.jpg', targetAmount: 10000,
    startDate: '2026-11-01', endDate: '2026-12-01', ...extra,
  };
}

describe('Publish readiness (step 10 checks, shared)', () => {
  it('returns exactly what step 10 returned before, for every case', () => {
    TestBed.configureTestingModule({});
    const state = TestBed.inject(CampaignStudioStateService);
    const base = ready(state);
    const cases: Partial<CampaignDraft>[] = [
      {}, { title: '  ' }, { slug: '' }, { coverImageUrl: null }, { heroType: 'video', videoUrl: '' }, { heroType: 'video', videoUrl: 'https://youtu.be/x' },
      { targetAmount: 0 }, { startDate: '2026-12-01', endDate: '2026-11-01' },
      { startDate: '2026-12-01', endDate: '2026-11-01', campaignLifecycle: 'ongoing' },
      { coverImageUrl: null, layout: { ...base.layout, pageFormat: 'minimal' } },
      { title: '', slug: '', coverImageUrl: null, targetAmount: 0 },
    ];
    for (const c of cases) {
      const d = { ...base, ...c };
      expect(publishMissingFields(d)).withContext(JSON.stringify(c)).toEqual(legacyMissing(d));
    }
  });
});

type Calls = Array<[string, ...unknown[]]>;
function makeApi(opts: { failPublish?: boolean; failSave?: boolean } = {}) {
  const calls: Calls = [];
  const api = {
    calls,
    getById: jasmine.createSpy('getById'),
    create: jasmine.createSpy('create').and.callFake((entityId: string, d: CampaignDraft) => { calls.push(['create', entityId, d.title]); return opts.failSave ? throwError(() => ({ error: { error: 'שגיאת שמירה מהשרת' } })) : of({ id: 'new-1' }); }),
    update: jasmine.createSpy('update').and.callFake((id: string, d: CampaignDraft) => { calls.push(['update', id, d.title]); return opts.failSave ? throwError(() => ({ error: { error: 'שגיאת שמירה מהשרת' } })) : of({ id }); }),
    publish: jasmine.createSpy('publish').and.callFake((id: string) => { calls.push(['publish', id]); return opts.failPublish ? throwError(() => ({ error: { error: 'A hero image or video is required to publish' } })) : of({}); }),
    requestPublish: jasmine.createSpy('requestPublish').and.callFake((id: string) => { calls.push(['requestPublish', id]); return of({ success: true, publish_requested_at: 'now' }); }),
    generateMetadata: jasmine.createSpy('generateMetadata').and.returnValue(of({ suggestedTitle: null, suggestedShortDescription: null })),
  };
  return api;
}

async function setupBed(api: any, entityStatus: string, routeId = 'c-1') {
  await TestBed.configureTestingModule({
    imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule],
    providers: [
      provideRouter([]), provideLocationMocks(),
      { provide: CampaignApiService, useValue: api },
      { provide: CampaignPartnersService, useValue: { listForCampaign: () => of({ partners: [] }), listPublicForCampaign: () => of([]), remove: () => of({}) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}), queryParamMap: convertToParamMap({}) } } },
      { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1', status: entityStatus }) } },
    ],
  }).compileComponents();
}

describe('Studio — publish action and readiness indicator', () => {
  async function open(entityStatus: string, extra: (d: CampaignDraft) => Partial<CampaignDraft> = () => ({})) {
    const api = makeApi();
    await setupBed(api, entityStatus);
    const state = TestBed.inject(CampaignStudioStateService);
    api.getById.and.callFake(() => of({ ...ready(state), ...extra(ready(state)) }));
    const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
    fixture.detectChanges(); fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, state, api, page: fixture.componentInstance };
  }
  const chip = (el: HTMLElement) => el.querySelector('.readiness-chip') as HTMLButtonElement;

  it('shows the missing step 10 fields, updates live, and never blocks saving', async () => {
    const { fixture, el, state, api } = await open('active', () => ({ title: '', targetAmount: 0 }));
    expect(chip(el).getAttribute('data-tone')).toBe('missing');
    expect(chip(el).textContent).toContain('חסרים 2 פרטים לפרסום');
    expect(chip(el).title).toContain('שם הקמפיין, יעד גיוס');
    fixture.debugElement.query(By.css('app-campaign-studio-topbar')).componentInstance.saveDraft();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.publish).not.toHaveBeenCalled();
    state.patch({ title: 'עכשיו יש שם', targetAmount: 5000 }); fixture.detectChanges();
    expect(chip(el).getAttribute('data-tone')).toBe('ready');
    expect(chip(el).textContent).toContain('מוכן לפרסום');
  });

  it('ready fields with an organization awaiting approval: "ממתין לאישור העמותה"', async () => {
    const { el } = await open('pending_review');
    expect(chip(el).getAttribute('data-tone')).toBe('pending');
    expect(chip(el).textContent).toContain('ממתין לאישור העמותה');
  });

  it('"פרסום" and the indicator open the wizard step 10 in a dialog; save stays a separate action', async () => {
    const { fixture, el } = await open('active');
    expect(el.querySelector('.publish-dialog')).toBeNull();
    (el.querySelector('.tool-btn--publish') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(el.querySelector('.publish-dialog app-campaign-publish-step')).not.toBeNull();
    (el.querySelector('.publish-dialog .add-menu-close') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(el.querySelector('.publish-dialog')).toBeNull();
    chip(el).click(); fixture.detectChanges();
    expect(el.querySelector('.publish-dialog app-campaign-publish-step')).not.toBeNull();
    expect(el.querySelector('app-campaign-studio-topbar .save-button')).not.toBeNull();
  });
});

describe('Studio vs wizard — step 10 publishing, identical outcomes', () => {
  type Outcome = { calls: Calls; navigate: unknown[][]; error: string | null; status: string; id: string | undefined };
  const scenarios: { name: string; entity: string; draft: (d: CampaignDraft) => Partial<CampaignDraft>; act: (c: CampaignPublishStepComponent) => void; api?: { failPublish?: boolean; failSave?: boolean } }[] = [
    { name: 'publish: ready, approved organization → save, publish, campaign list', entity: 'active', draft: () => ({}), act: c => c.publishCampaign() },
    { name: 'publish an unsaved campaign → create, then publish the new id', entity: 'active', draft: () => ({ id: undefined }), act: c => c.publishCampaign() },
    { name: 'publish with missing fields → error, no server call', entity: 'active', draft: () => ({ coverImageUrl: null, targetAmount: 0 }), act: c => c.publishCampaign() },
    { name: 'publish while the organization awaits approval → error, no server call', entity: 'pending_review', draft: () => ({}), act: c => c.publishCampaign() },
    { name: 'publish rejected by the server → its message, status unchanged', entity: 'active', draft: () => ({}), act: c => c.publishCampaign(), api: { failPublish: true } },
    { name: 'confirm and continue, ready, awaiting approval → save, publish request, dashboard', entity: 'pending_review', draft: () => ({}), act: c => c.confirmAndGoToCampaign() },
    { name: 'confirm and continue, not ready → save only, no publish request', entity: 'pending_review', draft: () => ({ title: '' }), act: c => c.confirmAndGoToCampaign() },
    { name: 'confirm and continue, approved → save, no publish request', entity: 'active', draft: () => ({}), act: c => c.confirmAndGoToCampaign() },
    { name: 'confirm and continue, save fails → server message', entity: 'pending_review', draft: () => ({}), act: c => c.confirmAndGoToCampaign(), api: { failSave: true } },
  ];

  for (const sc of scenarios) {
    it(sc.name, async () => {
      const api = makeApi(sc.api);
      const isNew = 'id' in sc.draft({} as CampaignDraft);
      await setupBed(api, sc.entity, isNew ? '' : 'c-1');
      const state = TestBed.inject(CampaignStudioStateService);
      const router = TestBed.inject(Router);
      const navigate = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      const start = { ...ready(state), ...sc.draft(ready(state)) };

      const run = (component: CampaignPublishStepComponent): Outcome => {
        api.calls.length = 0; navigate.calls.reset();
        sc.act(component);
        return { calls: [...api.calls], navigate: [...navigate.calls.allArgs()], error: component.errorMessage, status: state.draft.status, id: state.draft.id };
      };

      // Classic wizard: step 10 on its own.
      state.loadDraft(structuredClone(start));
      const wizardFixture = TestBed.createComponent(CampaignPublishStepComponent);
      wizardFixture.detectChanges();
      const wizard = run(wizardFixture.componentInstance);
      wizardFixture.destroy();

      // Studio: step 10 hosted in the publish dialog.
      api.getById.and.returnValue(of(structuredClone(start)));
      const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
      fixture.detectChanges(); fixture.detectChanges();
      if (isNew) {
        // /campaigns/create/studio: a fresh draft the user has filled in.
        fixture.componentInstance.showPresetPicker = false;
        state.patch(structuredClone(start));
        fixture.detectChanges();
      }
      (fixture.nativeElement.querySelector('.tool-btn--publish') as HTMLButtonElement).click(); fixture.detectChanges();
      const hosted = fixture.debugElement.query(By.directive(CampaignPublishStepComponent)).componentInstance as CampaignPublishStepComponent;
      const studio = run(hosted);

      expect(studio).toEqual(wizard);
      // Sanity: the scenario exercised what it says.
      if (sc.name.startsWith('publish with missing') || sc.name.includes('awaits approval')) expect(wizard.calls).toEqual([]);
      if (sc.name.includes('ready, approved organization')) expect(wizard.calls.map(c => c[0])).toEqual(['update', 'publish']);
      if (sc.name.includes('publish request, dashboard')) expect(wizard.calls.map(c => c[0])).toEqual(['update', 'requestPublish']);
      if (sc.name.includes('unsaved')) expect(wizard.calls).toEqual([['create', 'e-1', 'קמפיין מוכן'], ['publish', 'new-1']]);
      if (sc.name.includes('rejected')) expect(wizard.error).toBe('A hero image or video is required to publish');
    });
  }
});
