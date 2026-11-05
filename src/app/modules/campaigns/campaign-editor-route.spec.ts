import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute, Route, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { DEFAULT_CAMPAIGN_EDITOR, PUBLISH_STEP, campaignCreatePath, campaignEditPath, campaignStepLink } from './campaign-editor-route';
import { CampaignsPageComponent } from './pages/campaigns-page/campaigns-page.component';
import { CampaignDashboardStatusComponent } from './pages/campaign-dashboard-page/sections/campaign-dashboard-status/campaign-dashboard-status.component';
import { CampaignBuilderStudioPageComponent } from './studio/pages/campaign-builder-studio-page/campaign-builder-studio-page.component';
import { CampaignStudioPageComponent } from './studio/pages/campaign-studio-page/campaign-studio-page.component';
import { CampaignDraft, CampaignStudioStateService } from './services/campaign-studio-state.service';
import { CampaignApiService } from './services/campaign-api.service';
import { CurrentEntityService } from '../../core/services/current-entity.service';

function findRoute(path: string, list: Route[] = routes): Route | undefined {
  for (const r of list) {
    if (r.path === path) return r;
    const inner = r.children && findRoute(path, r.children);
    if (inner) return inner;
  }
  return undefined;
}

describe('Default campaign editor — paths', () => {
  it('the Studio is the default editor', () => {
    expect(DEFAULT_CAMPAIGN_EDITOR).toBe('studio');
    expect(campaignCreatePath()).toEqual(['/campaigns/create/studio']);
    expect(campaignEditPath('c-1')).toEqual(['/campaigns', 'c-1', 'studio']);
    expect(campaignStepLink('c-1', PUBLISH_STEP)).toEqual({ commands: ['/campaigns', 'c-1', 'studio'], queryParams: { returnStep: 10 } });
  });

  it('rollback: the classic setting gives the legacy Wizard paths', () => {
    expect(campaignCreatePath('classic')).toEqual(['/campaigns/create']);
    expect(campaignEditPath('c-1', 'classic')).toEqual(['/campaigns', 'c-1', 'edit']);
    expect(campaignStepLink('c-1', 4, 'classic')).toEqual({ commands: ['/campaigns', 'c-1', 'edit'], queryParams: { returnStep: 4 } });
  });
});

describe('Default campaign editor — routes (legacy fallback kept)', () => {
  it('the classic Wizard routes still load the classic editor', async () => {
    for (const path of ['campaigns/create', 'campaigns/:id/edit']) {
      const route = findRoute(path)!;
      expect(route).withContext(path).toBeDefined();
      expect(await (route.loadComponent!() as Promise<unknown>)).withContext(path).toBe(CampaignStudioPageComponent);
      expect(route.canDeactivate).withContext(path).toBeUndefined();
    }
  });

  it('the Studio routes load the Studio, with the same guard and the unsaved-changes check', async () => {
    const legacyGuard = findRoute('campaigns/:id/edit')!.canActivate;
    for (const path of ['campaigns/create/studio', 'campaigns/:id/studio']) {
      const route = findRoute(path)!;
      expect(await (route.loadComponent!() as Promise<unknown>)).withContext(path).toBe(CampaignBuilderStudioPageComponent);
      expect(route.canActivate).withContext(path).toEqual(legacyGuard);
      expect(route.canDeactivate?.length).withContext(path).toBe(1);
    }
  });

  it('create/studio is declared before :id/studio so "create" is never read as an id', () => {
    const flat = JSON.stringify(routes.map(r => r.path ?? ''));
    expect(flat.indexOf('campaigns/create/studio')).toBeLessThan(flat.indexOf('campaigns/:id/studio'));
  });
});

describe('Default campaign editor — entry points', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [provideRouter([])] }));

  it('the campaigns page creates and edits in the Studio; ambassadors keep their own studio', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const page = TestBed.runInInjectionContext(() => new CampaignsPageComponent());
    page.createCampaign();
    expect(navigate).toHaveBeenCalledWith(['/campaigns/create/studio']);
    spyOn(page as any, 'hasEntityManagerRole').and.returnValue(true);
    page.editCampaign('c-1');
    expect(navigate).toHaveBeenCalledWith(['/campaigns', 'c-1', 'studio']);
  });

  it('an ambassador-only user still opens the ambassador studio', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const page = TestBed.runInInjectionContext(() => new CampaignsPageComponent());
    spyOn(page as any, 'hasEntityManagerRole').and.returnValue(false);
    spyOn(page as any, 'ambassadorCampaignIds').and.returnValue(new Set(['c-9']));
    page.editCampaign('c-9');
    expect(navigate).toHaveBeenCalledWith(['/campaigns', 'c-9', 'ambassador-studio']);
  });

  it('the campaign dashboard edits and publishes through the Studio', () => {
    const bar = TestBed.runInInjectionContext(() => new CampaignDashboardStatusComponent());
    bar.campaignId = 'c-1';
    expect(bar.editLink).toEqual(['/campaigns', 'c-1', 'studio']);
    expect(bar.publishStepLink).toEqual(['/campaigns', 'c-1', 'studio']);
    expect(bar.publishStep).toBe(PUBLISH_STEP);
  });
});

describe('Default campaign editor — Studio by campaign type', () => {
  async function open(overrides: (d: CampaignDraft) => Partial<CampaignDraft>, query: Record<string, string> = {}) {
    const api = { getById: jasmine.createSpy('getById'), update: jasmine.createSpy('update'), create: jasmine.createSpy('create') };
    await TestBed.configureTestingModule({
      imports: [CampaignBuilderStudioPageComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        { provide: CampaignApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'c-1' }), queryParamMap: convertToParamMap(query) } } },
        { provide: CurrentEntityService, useValue: { currentEntity: () => ({ id: 'e-1', status: 'active' }) } },
      ],
    }).compileComponents();
    const state = TestBed.inject(CampaignStudioStateService);
    api.getById.and.returnValue(of({ ...state.draft, id: 'c-1', entityId: 'e-1', status: 'draft', title: 'קמפיין', ...overrides(state.draft) }));
    const fixture = TestBed.createComponent(CampaignBuilderStudioPageComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('a standard campaign opens in the Studio', async () => {
    const { el, page } = await open(() => ({}));
    expect(el.querySelector('.studio')).not.toBeNull();
    expect(el.querySelector('.canvas-frame app-campaign-preview')).not.toBeNull();
    page.history.stop();
  });

  it('an ongoing campaign opens without the registration step (wizard rule)', async () => {
    const { el, page } = await open(() => ({ campaignLifecycle: 'ongoing' } as Partial<CampaignDraft>));
    const labels = Array.from(el.querySelectorAll('.tree-row .tree-label')).map(n => n.textContent!.trim());
    expect(labels).not.toContain('אפשרויות הרשמה');
    page.history.stop();
  });

  it('a minimal donation page opens in the Studio with its own canvas', async () => {
    const { el, page } = await open(d => ({ layout: { ...d.layout, pageFormat: 'minimal' } }));
    expect(el.querySelector('.canvas-frame app-minimal-donation-page')).not.toBeNull();
    page.history.stop();
  });

  it('a partner-owned page stays on the classic editor: the Studio links there', async () => {
    const { el } = await open(() => ({ ownerType: 'partner' } as Partial<CampaignDraft>));
    expect(el.querySelector('.studio')).toBeNull();
    expect(el.querySelector('.studio-message a')!.getAttribute('href')).toBe('/campaigns/c-1/edit');
  });

  it('?returnStep=10 (publish links) opens the publish dialog', async () => {
    const { page } = await open(() => ({}), { returnStep: String(PUBLISH_STEP) });
    expect(page.showPublish).toBeTrue();
    page.history.stop();
  });

  it('?returnStep=4 (back from creating a partner) selects the rewards area', async () => {
    const { page } = await open(() => ({}), { returnStep: '4' });
    expect(page.selectedKey).toBe('area:rewards');
    expect(page.showPublish).toBeFalse();
    page.history.stop();
  });

  it('?returnStep of a step hidden for this campaign keeps the default selection', async () => {
    const { page } = await open(() => ({ campaignLifecycle: 'ongoing' } as Partial<CampaignDraft>), { returnStep: '5' });
    expect(page.selectedKey).toBe('area:opening');
    page.history.stop();
  });

  it('the Studio keeps a link to the classic editor for existing campaigns', async () => {
    const { el, page } = await open(() => ({}));
    const link = Array.from(el.querySelectorAll<HTMLAnchorElement>('.studio-tools a')).find(a => a.textContent!.includes('עורך קלאסי'));
    expect(link?.getAttribute('href')).toContain('/campaigns/c-1/edit');
    page.history.stop();
  });
});
