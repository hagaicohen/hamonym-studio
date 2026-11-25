import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { CampaignBuilderStudioPageComponent } from './campaign-builder-studio-page.component';
import { CampaignDraft, CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CampaignPartnersService } from '../../../services/campaign-partners.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { CampaignOfferingsStepComponent } from '../../../builder/steps/campaign-offerings-step/campaign-offerings-step.component';
import { CampaignRegistrationStepComponent } from '../../../builder/steps/campaign-registration-step/campaign-registration-step.component';
import { CampaignSponsorsStepComponent } from '../../../builder/steps/campaign-sponsors-step/campaign-sponsors-step.component';
import { CampaignAmbassadorsStepComponent } from '../../../builder/steps/campaign-ambassadors-step/campaign-ambassadors-step.component';
import { CampaignUpdatesStepComponent } from '../../../builder/steps/campaign-updates-step/campaign-updates-step.component';
import { CampaignStudioTopbarComponent } from '../../topbar/campaign-studio-topbar/campaign-studio-topbar.component';

// Group E, increment 2 (2026-11-05): steps 4–8 hosted in the Studio.

type Combo = { lifecycle: 'one-time' | 'ongoing'; status: 'draft' | 'published' };
const AREAS: Record<number, string> = { 4: 'area:rewards', 5: 'area:registration', 6: 'area:sponsors', 7: 'area:ambassadors', 8: 'area:updates' };

function draftFor(state: CampaignStudioStateService, c: Combo, extra: Partial<CampaignDraft> = {}): CampaignDraft {
  const base = state.draft;
  return {
    ...base, id: 'c-1', entityId: 'e-1', title: 'קמפיין', slug: 'kampein', status: c.status,
    campaignLifecycle: c.lifecycle, fundingType: c.lifecycle === 'ongoing' ? 'recurring' : 'flexible',
    targetAmount: 20000, offeringsEnabled: true,
    blocks: [
      ...base.blocks.filter(b => !['sponsors', 'ambassadors', 'updates'].includes(b.type)),
      { id: 'sp', type: 'sponsors', order: 50, visible: true, label: 'חסויות', spacingTop: 0, spacingBottom: 0, data: {} as any },
      { id: 'am', type: 'ambassadors', order: 51, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} as any },
      { id: 'up', type: 'updates', order: 52, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'slider' } as any },
    ],
    ...extra,
  };
}

function providersWith(api: any, partners: any = { listForCampaign: () => of({ partners: [] }), listPublicForCampaign: () => of([]), remove: () => of({}) }, id = 'c-1') {
  return [
    provideRouter([]), provideLocationMocks(),
    { provide: CampaignApiService, useValue: api },
    { provide: CampaignPartnersService, useValue: partners },
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}), queryParamMap: convertToParamMap({}) } } },
    { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1', status: 'active' }) } },
  ];
}

async function openStudio(c: Combo) {
  const api = { getById: () => of(draftFor(TestBed.inject(CampaignStudioStateService), c)), update: jasmine.createSpy('update').and.returnValue(of({ id: 'c-1' })), create: jasmine.createSpy('create') };
  await TestBed.configureTestingModule({ imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule], providers: providersWith(api) }).compileComponents();
  const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
  fixture.detectChanges(); fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, api };
}

describe('Studio — steps 4–8 visibility follows the wizard rules', () => {
  it('draft one-time: every step 4–8 area hosts its wizard component', async () => {
    const { fixture, page, el } = await openStudio({ lifecycle: 'one-time', status: 'draft' });
    const tags: Record<number, string> = { 4: 'app-campaign-offerings-step', 5: 'app-campaign-registration-step', 6: 'app-campaign-sponsors-step', 7: 'app-campaign-ambassadors-step', 8: 'app-campaign-updates-step' };
    for (const step of [4, 5, 6, 7, 8]) {
      page.select(AREAS[step]); fixture.detectChanges();
      expect(el.querySelector('.props-panel ' + tags[step])).withContext('step ' + step).not.toBeNull();
    }
  });

  it('ongoing: registration is not offered at all (step 5 is hidden in the wizard)', async () => {
    const { el } = await openStudio({ lifecycle: 'ongoing', status: 'draft' });
    const labels = Array.from(el.querySelectorAll('.tree-row .tree-label')).map(n => n.textContent!.trim());
    expect(labels).not.toContain('אפשרויות הרשמה');
    expect(labels).toContain('רשימת התשורות');
  });

  it('published: steps 4–8 link to their Workspace pages and are not editable forms here', async () => {
    const { fixture, page, el } = await openStudio({ lifecycle: 'one-time', status: 'published' });
    const expected: Record<number, string> = { 4: '/campaigns/c-1/rewards', 5: '/campaigns/c-1/registration', 6: '/campaigns/c-1/sponsors', 7: '/campaigns/c-1/ambassadors', 8: '/campaigns/c-1/dashboard#updates' };
    for (const step of [4, 5, 6, 7, 8]) {
      page.select(AREAS[step]); fixture.detectChanges();
      const panel = el.querySelector('.props-panel')!;
      expect(panel.querySelector('app-campaign-offerings-step, app-campaign-registration-step, app-campaign-sponsors-step, app-campaign-ambassadors-step, app-campaign-updates-step')).withContext('step ' + step).toBeNull();
      expect(panel.querySelector('.props-link')!.getAttribute('href')).withContext('step ' + step).toBe(expected[step]);
    }
  });

  it('a half-filled form is dropped when leaving the area, exactly like leaving the wizard step', async () => {
    const { fixture, page, el } = await openStudio({ lifecycle: 'one-time', status: 'draft' });
    const state = TestBed.inject(CampaignStudioStateService);
    page.select(AREAS[6]); fixture.detectChanges();
    const sponsors = fixture.debugElement.query(By.directive(CampaignSponsorsStepComponent)).componentInstance as CampaignSponsorsStepComponent;
    sponsors.form.name = 'לא נשמר';
    page.select(AREAS[8]); fixture.detectChanges();
    page.select(AREAS[6]); fixture.detectChanges();
    const again = fixture.debugElement.query(By.directive(CampaignSponsorsStepComponent)).componentInstance as CampaignSponsorsStepComponent;
    expect(again.form.name).toBe('');
    expect(state.draft.sponsors.length).toBe(0);
    expect(el.querySelector('.props-panel app-campaign-sponsors-step')).not.toBeNull();
  });
});

describe('Studio — partner linking on an unsaved campaign', () => {
  async function openNew() {
    const api = {
      getById: jasmine.createSpy('getById'),
      update: jasmine.createSpy('update').and.returnValue(of({ id: 'new-1' })),
      create: jasmine.createSpy('create').and.returnValue(of({ id: 'new-1' })),
    };
    const partners = { listForCampaign: jasmine.createSpy('list').and.returnValue(of({ partners: [] })), listPublicForCampaign: () => of([]), remove: () => of({}) };
    await TestBed.configureTestingModule({ imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule], providers: providersWith(api, partners, '') }).compileComponents();
    const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.onPresetSelected('general');
    page.onStartTemplateSelected({ template: (await import('../../../builder/templates/campaign-templates')).CAMPAIGN_TEMPLATES[0], palette: (await import('../../../builder/templates/campaign-templates')).TEMPLATE_PALETTES[0] });
    fixture.detectChanges();
    return { fixture, page, api, partners, state: TestBed.inject(CampaignStudioStateService), el: fixture.nativeElement as HTMLElement };
  }

  it('creates the campaign once, stays in the Studio with the draft and the link dialog, and later saves update it', async () => {
    const { fixture, page, api, partners, state } = await openNew();
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    spyOn(router, 'navigate').and.callThrough();
    state.patch({ title: 'קמפיין חדש', targetAmount: 12000 });
    page.select(AREAS[4]); fixture.detectChanges();
    const step = fixture.debugElement.query(By.directive(CampaignOfferingsStepComponent)).componentInstance as CampaignOfferingsStepComponent;
    step.offering.title = 'ספל';
    api.create.and.callFake(() => { step.openPartnerPickerForCurrentOffering(); return of({ id: 'new-1' }); });
    step.openPartnerPickerForCurrentOffering();
    step.openPartnerPickerForCurrentOffering();
    fixture.detectChanges();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(location.path()).toBe('/campaigns/new-1/studio');
    expect(page.isNew).toBeFalse();
    expect(page.campaignId).toBe('new-1');
    expect(page.selectedKey).toBe(AREAS[4]);
    expect(state.draft.id).toBe('new-1');
    expect(state.draft.title).toBe('קמפיין חדש');
    expect(state.draft.offerings.map(o => o.title)).toEqual(['ספל']);
    expect(step.linkModalRewardId).toBe(state.draft.offerings[0].id);
    expect(partners.listForCampaign).toHaveBeenCalledWith('new-1');
    fixture.debugElement.query(By.directive(CampaignStudioTopbarComponent)).componentInstance.saveDraft();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith('new-1', jasmine.anything());
  });

  it('the classic wizard keeps its own behavior: navigates to the edit URL after creating', async () => {
    const api = { create: jasmine.createSpy('create').and.returnValue(of({ id: 'new-2' })) };
    await TestBed.configureTestingModule({ imports: [CampaignOfferingsStepComponent, HttpClientTestingModule], providers: providersWith(api, undefined, '') }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    state.reset();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    const fixture = TestBed.createComponent(CampaignOfferingsStepComponent);
    fixture.detectChanges();
    fixture.componentInstance.offering.title = 'ספל';
    fixture.componentInstance.openPartnerPickerForCurrentOffering();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/campaigns', 'new-2', 'edit'], { replaceUrl: true });
  });
});

describe('Studio vs wizard — identical inputs, identical draft and API payload (steps 4–8)', () => {
  const current = () => TestBed.inject(CampaignStudioStateService).draft;
  const input = (value: string) => ({ target: { value } }) as unknown as Event;
  type Scenario<T> = { name: string; step: number; component: new (...a: any[]) => T; run: (c: T, tick: (ms: number) => void) => void };
  const scenarios: Scenario<any>[] = [
    { name: 'rewards: add, edit, duplicate, delete, invalid form', step: 4, component: CampaignOfferingsStepComponent, run: (c: CampaignOfferingsStepComponent, tick) => {
      c.save();
      c.offering.title = 'ספל'; c.onAmountInput(input('1,800')); c.onStockInput(input('12')); c.offering.featured = true; c.save(); tick(5);
      c.offering.title = 'חולצה'; c.save(); tick(5);
      c.editOffering(c.draft.offerings[0]); c.offering.description = 'קרמיקה'; c.save(); tick(5);
      c.duplicateOffering(c.draft.offerings[1]); tick(5); c.save(); tick(5);
      c.deleteOffering(c.draft.offerings[0].id);
    } },
    { name: 'registration: invalid, add, edit, duplicate, delete (with the save delay)', step: 5, component: CampaignRegistrationStepComponent, run: (c: CampaignRegistrationStepComponent, tick) => {
      c.save(); tick(500);
      c.onTitleInput(input('10 ק"מ')); c.onPriceInput(input('120')); c.save(); tick(500); tick(2000);
      c.onTitleInput(input('5 ק"מ')); c.onPriceInput(input('80')); c.onKeyInput(input('5k')); c.save(); tick(500); tick(2000);
      c.editOption(c.draft.registrationOptions[0]); c.onDescriptionInput(input('כולל חולצה')); c.save(); tick(500); tick(2000);
      c.duplicateOption(c.draft.registrationOptions[1]); tick(5); c.deleteOption(c.draft.registrationOptions[0].id);
    } },
    { name: 'sponsors: add, edit, delete, hide the page section', step: 6, component: CampaignSponsorsStepComponent, run: (c: CampaignSponsorsStepComponent) => {
      c.save();
      c.form = { name: 'בנק', logoUrl: '', link: 'https://example.com' }; c.save();
      c.form = { name: 'עירייה', logoUrl: 'https://example.com/l.png', link: '' }; c.save();
      c.editSponsor(current().sponsors[0]); c.form.name = 'בנק הפועלים'; c.save();
      c.deleteSponsor(current().sponsors[1].id);
      c.toggleSponsorsVisible();
    } },
    { name: 'ambassadors: slug rules, add, edit, import, delete, hide the page section', step: 7, component: CampaignAmbassadorsStepComponent, run: (c: CampaignAmbassadorsStepComponent, tick) => {
      c.openAdd(); c.form.fullName = 'דנה כהן'; c.onFullNameInput(); tick(600); c.save();
      c.openAdd(); c.form.fullName = 'רון לוי'; c.onFullNameInput(); tick(600);
      c.form.slug = 'Bad Slug!'; c.onSlugInput(); tick(600); c.save();
      c.form.slug = c.ambassadors[0].slug; c.onSlugInput(); tick(600); c.save();
      c.form.slug = 'ron'; c.onSlugInput(); tick(600); c.form.goalAmount = 99999; c.save();
      c.openEdit(c.ambassadors[0]); c.form.personalMessage = 'תודה'; c.save();
      c.importRows = [{ fullName: 'נועה', phone: '050', email: '', goalAmount: 500, personalMessage: '', valid: true }, { fullName: '', phone: '', email: '', goalAmount: null, personalMessage: '', valid: false, error: 'שם חסר' }] as any;
      c.confirmImport();
      c.delete(c.ambassadors[1].id);
      c.toggleAmbassadorsVisible();
    } },
    { name: 'updates: add, edit, delete, hide the page section', step: 8, component: CampaignUpdatesStepComponent, run: (c: CampaignUpdatesStepComponent) => {
      c.save();
      c.form.title = 'עדכון ראשון'; c.form.description = 'התחלנו'; c.save();
      c.form.title = 'עדכון שני'; c.form.linkUrl = 'https://example.com'; c.save();
      c.edit(current().updates[0]); c.form.description = 'התחלנו בגדול'; c.save();
      c.delete(current().updates[1].id);
      c.toggleUpdatesVisible();
    } },
  ];

  // Same clock and random sequence for both runs, so ids generated from
  // Date.now() / Math.random() match when the behavior matches.
  let seed = 1;
  beforeEach(() => {
    jasmine.clock().install();
    spyOn(Math, 'random').and.callFake(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
  });
  afterEach(() => jasmine.clock().uninstall());
  function deterministic<R>(fn: (tick: (ms: number) => void) => R): R {
    jasmine.clock().mockDate(new Date('2026-11-05T09:00:00Z'));
    seed = 1;
    return fn(ms => jasmine.clock().tick(ms));
  }

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

  for (const sc of scenarios) {
    it(`step ${sc.step} — ${sc.name}`, async () => {
      const api = { getById: jasmine.createSpy('getById'), update: jasmine.createSpy('update'), create: jasmine.createSpy('create') };
      await TestBed.configureTestingModule({ imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule], providers: providersWith(api) }).compileComponents();
      const state = TestBed.inject(CampaignStudioStateService);
      const http = TestBed.inject(HttpTestingController);
      spyOn(window, 'confirm').and.returnValue(true);
      const start = draftFor(state, { lifecycle: 'one-time', status: 'draft' });

      const wizard = deterministic(tick => {
        state.loadDraft(structuredClone(start));
        const fixture = TestBed.createComponent(sc.component as any);
        fixture.detectChanges();
        sc.run(fixture.componentInstance, tick);
        fixture.destroy();
        return structuredClone(state.draft);
      });

      const studio = deterministic(tick => {
        api.getById.and.returnValue(of(structuredClone(start)));
        const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
        fixture.detectChanges(); fixture.detectChanges();
        fixture.componentInstance.select(AREAS[sc.step]); fixture.detectChanges();
        sc.run(fixture.debugElement.query(By.directive(sc.component as any)).componentInstance, tick);
        const result = structuredClone(state.draft);
        fixture.destroy();
        return result;
      });

      expect(studio).toEqual(wizard);
      const body: any = payload(studio, http);
      expect(body).toEqual(payload(wizard, http) as any);
      // Related tables are synced from these payload fields on every save.
      expect(Object.keys(body)).toEqual(jasmine.arrayContaining(['registration_options', 'ambassadors', 'rewards', 'sponsors', 'updates', 'blocks']));
      expect(JSON.stringify(wizard)).not.toEqual(JSON.stringify(start));
    });
  }
});
