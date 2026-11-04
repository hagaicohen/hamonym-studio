import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { OrganizationRegistrationComponent } from './pages/organization-registration/organization-registration.component';
import { OrganizationRegistrationStateService } from './services/organization-registration-state.service';
import { CurrentEntityService } from '../../core/services/current-entity.service';
import { authGuard } from '../../core/guards/auth.guard';
import { CampaignDiscoverComponent } from '../campaigns/pages/campaign-discover/campaign-discover.component';
import { CampaignApiService } from '../campaigns/services/campaign-api.service';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { StepEntityComponent } from './components/step-entity/step-entity.component';

describe('Personal menu: new organization and ambassador entry', () => {
  let query: Record<string, string>;
  let http: HttpTestingController;
  const existing = { id: 'existing', display_name: 'Active organization', status: 'rejected' };
  beforeEach(() => {
    query = { mode: 'new' };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: CurrentEntityService, useValue: { currentEntity: signal(existing) } },
      { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return convertToParamMap(query); } } } },
    ] });
    // Keep real wizard initialization/state and service calls; render only the
    // first existing step so no payment widgets are instantiated by these tests.
    TestBed.overrideComponent(OrganizationRegistrationComponent, { set: { template: '<app-step-entity />' } });
    TestBed.overrideComponent(CampaignDiscoverComponent, { set: { template: '' } });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('starts with clean instance-scoped state, not active organization or previous wizard state', () => {
    const stale = TestBed.inject(OrganizationRegistrationStateService);
    stale.updateState({ entityId: 'old-draft', organizationName: 'Old', terminalNumber: 'old-terminal', logoFile: new File(['old'], 'old.png') });
    const fixture = TestBed.createComponent(OrganizationRegistrationComponent); fixture.detectChanges();
    const state = fixture.debugElement.injector.get(OrganizationRegistrationStateService);
    expect(state).not.toBe(stale);
    expect(fixture.debugElement.query(By.directive(StepEntityComponent)).injector.get(OrganizationRegistrationStateService)).toBe(state);
    expect(state.state().entityId).toBeNull(); expect(state.state().organizationName).toBe('');
    expect(state.state().terminalNumber).toBe(''); expect(state.state().logoFile).toBeNull();
    expect(fixture.componentInstance.drafts()).toEqual([]);
    expect(TestBed.inject(CurrentEntityService).currentEntity()?.id).toBe('existing');
    http.expectNone(() => true); fixture.destroy();
  });
  it('creates a new row only after explicit save and never updates the active organization', () => {
    const fixture = TestBed.createComponent(OrganizationRegistrationComponent); fixture.detectChanges();
    const state = fixture.debugElement.injector.get(OrganizationRegistrationStateService);
    state.updateState({ entityType: 'association', organizationName: 'New organization', organizationNumber: '123' });
    http.expectNone(() => true);
    fixture.componentInstance.saveDraft();
    const request = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/entities'));
    expect(request.request.body.legal_name).toBe('New organization');
    request.flush({ entity: { id: 'new', status: 'draft' } });
    expect(state.state().entityId).toBe('new');
    expect(TestBed.inject(CurrentEntityService).currentEntity()?.id).toBe('existing');
    http.expectNone(r => r.method === 'PATCH'); fixture.destroy();
  });
  it('does not carry edited state into a later new wizard instance', () => {
    const first = TestBed.createComponent(OrganizationRegistrationComponent); first.detectChanges();
    first.debugElement.injector.get(OrganizationRegistrationStateService).updateState({ organizationName: 'Unrelated previous work' });
    first.destroy();
    const second = TestBed.createComponent(OrganizationRegistrationComponent); second.detectChanges();
    expect(second.debugElement.injector.get(OrganizationRegistrationStateService).state().organizationName).toBe('');
    second.destroy();
  });
  it('preserves the existing explicit resume prompt for ordinary wizard entry', () => {
    query = {};
    const fixture = TestBed.createComponent(OrganizationRegistrationComponent); fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/entities/my')).flush({ entities: [{ ...existing, status: 'draft', legal_name: 'Draft' }] });
    expect(fixture.debugElement.injector.get(OrganizationRegistrationStateService).state().entityId).toBeNull();
    fixture.componentInstance.resumeDraft('existing');
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/api/entities/existing')).flush({ ...existing, status: 'draft', legal_name: 'Draft' });
    expect(fixture.debugElement.injector.get(OrganizationRegistrationStateService).state().entityId).toBe('existing');
    fixture.destroy();
  });
  it('keeps authentication required and preserves the new-organization return URL', () => {
    spyOn(localStorage, 'getItem').and.returnValue(null);
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/organization-registration?mode=new' } as any));
    expect(TestBed.inject(Router).serializeUrl(result as any)).toContain('returnUrl=%2Forganization-registration%3Fmode%3Dnew');
  });
  it('takes an organization manager through existing ambassador discovery and campaign join navigation', () => {
    query = { mode: 'ambassador' };
    spyOn(TestBed.inject(CampaignApiService), 'discover').and.returnValue(of({ campaigns: [], total: 0, page: 0, limit: 12 }));
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(CampaignDiscoverComponent); fixture.detectChanges();
    expect(fixture.componentInstance.mode).toBe('ambassador');
    fixture.componentInstance.openCampaign({ slug: 'published-campaign' } as any);
    expect(navigate).toHaveBeenCalledWith(['/campaigns', 'published-campaign', 'view'], { queryParams: { join: 'ambassador' } });
    expect(TestBed.inject(CurrentEntityService).currentEntity()?.id).toBe('existing');
    fixture.destroy();
  });
});
