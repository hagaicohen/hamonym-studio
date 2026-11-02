import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { welcomeGuard } from './welcome.guard';
import { contextGuard } from './context.guard';
import { EntitiesService } from '../services/entities.service';
import { CurrentContextService } from '../services/current-context.service';
import { CurrentEntityService } from '../services/current-entity.service';

@Component({ standalone: true, template: '' })
class EntryStub {}

const first = { id: 'org-1', display_name: 'First', role: 'owner', entity_type: 'association' };
const second = { id: 'org-2', display_name: 'Second', role: 'owner', entity_type: 'association' };

describe('Welcome organization routing', () => {
  let storage: Record<string, string>;
  let api: jasmine.Spy;
  let selected: { setEntity: jasmine.Spy; setRole: jasmine.Spy };
  beforeEach(() => {
    storage = { token: 'test-token' };
    spyOn(localStorage, 'getItem').and.callFake(key => storage[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key, value) => { storage[key] = value; });
    spyOn(localStorage, 'removeItem').and.callFake(key => { delete storage[key]; });
    api = jasmine.createSpy('getMyEntities').and.returnValue(of({ entities: [] }));
    selected = { setEntity: jasmine.createSpy('setEntity'), setRole: jasmine.createSpy('setRole') };
    TestBed.configureTestingModule({ providers: [provideHttpClient(),
      { provide: EntitiesService, useValue: { getMyEntities: api } },
      { provide: CurrentEntityService, useValue: selected },
      provideRouter([
        { path: '', pathMatch: 'full', component: EntryStub, canActivate: [welcomeGuard] },
        { path: 'welcome', component: EntryStub, canActivate: [welcomeGuard] },
        { path: 'dashboard', component: EntryStub, canActivate: [contextGuard] },
        { path: 'platform', component: EntryStub },
        { path: 'campaigns/discover', component: EntryStub },
        { path: 'login', component: EntryStub },
      ])
    ] });
  });
  for (const url of ['/', '/welcome']) {
    it(`keeps guests on ${url} without querying protected data`, async () => {
      delete storage['token'];
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      expect(TestBed.inject(Router).url).toBe(url);
      expect(api).not.toHaveBeenCalled();
    });
    it(`sends an organization member from ${url} to the existing dashboard`, async () => {
      api.and.returnValue(of({ entities: [first] }));
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      expect(TestBed.inject(Router).url).toBe('/dashboard');
      expect(selected.setEntity).toHaveBeenCalledWith(first);
      expect(TestBed.inject(CurrentContextService).active()?.context?.id).toBe(first.id);
    });
  }
  it('restores the selected organization among multiple organizations', async () => {
    const context = TestBed.inject(CurrentContextService);
    context.initFromLogin({ entities: [first, second] });
    context.switchContext('entity-manager', second.id);
    api.and.returnValue(of({ entities: [first, second] }));
    const harness = await RouterTestingHarness.create(); await harness.navigateByUrl('/');
    expect(context.active()?.context?.id).toBe(second.id);
    expect(selected.setEntity).toHaveBeenCalledWith(second);
    expect(context.roles()[0].contexts.length).toBe(2);
  });
  it('replaces a deleted saved organization using the existing default context policy', async () => {
    const context = TestBed.inject(CurrentContextService);
    context.initFromLogin({ entities: [second] });
    api.and.returnValue(of({ entities: [first] }));
    const harness = await RouterTestingHarness.create(); await harness.navigateByUrl('/');
    expect(context.active()?.context?.id).toBe(first.id);
    expect(selected.setEntity).toHaveBeenCalledWith(first);
  });
  it('keeps users without organizations in welcome even if old context data exists', async () => {
    const context = TestBed.inject(CurrentContextService);
    context.initFromLogin({ entities: [first] });
    const harness = await RouterTestingHarness.create(); await harness.navigateByUrl('/welcome');
    expect(TestBed.inject(Router).url).toBe('/welcome');
    expect(context.roles().some(r => r.role === 'entity-manager')).toBeFalse();
    expect(selected.setEntity).not.toHaveBeenCalled();
  });
  it('preserves ambassador and donor roles while resuming the organization dashboard', async () => {
    const context = TestBed.inject(CurrentContextService);
    context.initFromLogin({ entities: [first], ambassadorCampaigns: [{ id: 'campaign', name: 'Campaign' }], isDonor: true });
    context.switchContext('donor', null);
    api.and.returnValue(of({ entities: [first] }));
    const harness = await RouterTestingHarness.create(); await harness.navigateByUrl('/');
    expect(context.active()?.role).toBe('entity-manager');
    expect(context.roles().map(r => r.role)).toEqual(['entity-manager', 'ambassador', 'donor']);
  });
  it('preserves dedicated platform admin navigation', async () => {
    storage['adminMode'] = 'true';
    const harness = await RouterTestingHarness.create(); await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/platform');
    expect(api).not.toHaveBeenCalled();
  });
  it('does not infer ownership or redirect repeatedly when the API is unavailable', async () => {
    api.and.returnValue(throwError(() => new Error('unavailable')));
    const harness = await RouterTestingHarness.create(); await harness.navigateByUrl('/welcome');
    expect(TestBed.inject(Router).url).toBe('/welcome');
    expect(selected.setEntity).not.toHaveBeenCalled();
  });
  it('keeps public discovery accessible even for organization members', async () => {
    api.and.returnValue(of({ entities: [first] }));
    const harness = await RouterTestingHarness.create(); await harness.navigateByUrl('/campaigns/discover');
    expect(TestBed.inject(Router).url).toBe('/campaigns/discover');
    expect(api).not.toHaveBeenCalled();
  });
});
