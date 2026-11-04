import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { CurrentEntityService } from './current-entity.service';
import { CurrentContextService, ENTITY_PREFERENCES_KEY } from './current-context.service';
import { EntitiesService } from './entities.service';
import { AuthService } from './auth.service';
import { TopbarComponent } from '../layout/topbar/topbar.component';
import { NotificationBellComponent } from '../layout/notification-bell/notification-bell.component';
import { OrganizationEntryService } from './organization-entry.service';
import { CampaignsPageComponent } from '../../modules/campaigns/pages/campaigns-page/campaigns-page.component';
import { CampaignApiService } from '../../modules/campaigns/services/campaign-api.service';
import { AppLoaderService } from './app-loader.service';

@Component({ selector: 'app-notification-bell', standalone: true, template: '' })
class BellStub {}

describe('Authorized organization switcher', () => {
  let storage: Record<string, string>;
  let requests: Array<{ id: string; result: Subject<any> }>;
  let ctx: CurrentContextService;
  let current: CurrentEntityService;
  const organizations = [
    { id: 'a', display_name: 'Organization A', status: 'changes_requested', role: 'owner' },
    { id: 'b', display_name: 'Organization B', status: 'rejected', role: 'owner' },
  ];
  beforeEach(() => {
    storage = { token: 'token', user: JSON.stringify({ id: 9, full_name: 'Owner' }) };
    spyOn(localStorage, 'getItem').and.callFake(key => storage[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key, value) => storage[key] = value);
    spyOn(localStorage, 'removeItem').and.callFake(key => { delete storage[key]; });
    spyOn(localStorage, 'clear').and.callFake(() => { storage = {}; });
    requests = [];
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([]),
      { provide: AppLoaderService, useValue: { show: () => {}, hide: () => {} } },
      { provide: EntitiesService, useValue: { getEntityById: (id: string) => {
        const result = new Subject<any>(); requests.push({ id, result }); return result;
      } } },
    ] });
    TestBed.overrideComponent(TopbarComponent, {
      remove: { imports: [NotificationBellComponent] }, add: { imports: [BellStub] },
    });
    TestBed.overrideComponent(CampaignsPageComponent, { set: { template: '' } });
    ctx = TestBed.inject(CurrentContextService);
    ctx.initFromLogin({ entities: organizations });
    current = TestBed.inject(CurrentEntityService);
    current.setEntity(organizations[0]);
    TestBed.flushEffects();
  });
  function header() {
    const fixture = TestBed.createComponent(TopbarComponent);
    fixture.componentInstance.dropdownOpen = true;
    fixture.detectChanges();
    return fixture;
  }
  function respond(entity: any) {
    const request = requests[requests.length - 1];
    expect(request.id).toBe(entity.id);
    request.result.next(entity); request.result.complete();
    TestBed.flushEffects();
  }
  it('switches rejected and correction organizations only after server authorization', () => {
    const fixture = header();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.componentInstance.switchContext('entity-manager', 'b', new MouseEvent('click'));
    expect(ctx.active()?.context?.id).toBe('a');
    expect(current.currentEntity().id).toBe('a');
    respond(organizations[1]);
    expect(current.currentEntity().status).toBe('rejected');
    expect(ctx.active()?.context?.name).toBe('Organization B');
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    fixture.componentInstance.switchContext('entity-manager', 'a', new MouseEvent('click'));
    respond(organizations[0]);
    expect(current.currentEntity().status).toBe('changes_requested');
    fixture.destroy();
  });
  it('keeps the active entity and displays an error when the server denies access', () => {
    const fixture = header();
    fixture.componentInstance.switchContext('entity-manager', 'b', new MouseEvent('click'));
    requests[requests.length - 1].result.error({ status: 403 }); fixture.detectChanges();
    expect(current.currentEntity().id).toBe('a');
    expect(ctx.active()?.context?.id).toBe('a');
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    fixture.destroy();
  });
  it('rejects an entity absent from the authorized context list', () => {
    const error = jasmine.createSpy('error');
    current.selectEntity('foreign').subscribe({ error });
    expect(error).toHaveBeenCalled(); expect(requests.length).toBe(0);
    expect(ctx.active()?.context?.id).toBe('a');
  });
  it('cancels earlier selections and never installs their late responses or navigation intent', () => {
    const fixture = header();
    fixture.componentInstance.switchContext('entity-manager', 'b', new MouseEvent('click'));
    const late = requests[requests.length - 1].result;
    fixture.componentInstance.switchContext('entity-manager', 'a', new MouseEvent('click'));
    respond(organizations[0]); late.next(organizations[1]);
    expect(current.currentEntity().id).toBe('a');
    expect(ctx.active()?.context?.id).toBe('a');
    expect(TestBed.inject(OrganizationEntryService).consume('b')).toBeFalse();
    fixture.destroy();
  });
  it('ignores mismatched server responses and leaves status unchanged', () => {
    current.selectEntity('b').subscribe({ error: () => {} });
    requests[requests.length - 1].result.next(organizations[0]);
    expect(current.currentEntity().id).toBe('a');
    expect(ctx.active()?.context?.id).toBe('a');
  });
  it('uses keyboard-focusable buttons and clearly marks only the active organization', () => {
    const fixture = header();
    const buttons = fixture.nativeElement.querySelectorAll('button.ctx-context-item');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-current')).toBe('true');
    expect(buttons[1].getAttribute('aria-current')).toBeNull();
    fixture.componentInstance.closeOnFocusOut({ currentTarget: fixture.nativeElement.querySelector('.ctx-wrapper'), relatedTarget: buttons[1] } as any);
    expect(fixture.componentInstance.dropdownOpen).toBeTrue();
    buttons[1].click(); respond(organizations[1]);
    fixture.componentInstance.dropdownOpen = true; fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[aria-current=true]').length).toBe(1);
    fixture.destroy();
  });
  it('restores the selected entity on refresh and revalidates it against login memberships', () => {
    current.selectEntity('b').subscribe(); respond(organizations[1]);
    const refreshed = new CurrentContextService();
    expect(refreshed.active()?.context?.id).toBe('b');
    refreshed.initFromLogin({ entities: organizations });
    expect(refreshed.active()?.context?.id).toBe('b');
    refreshed.initFromLogin({ entities: [organizations[0]] });
    expect(refreshed.active()?.context?.id).toBe('a');
  });
  it('retains only a per-user UI preference across logout, never authentication', () => {
    current.selectEntity('b').subscribe(); respond(organizations[1]);
    const auth = TestBed.inject(AuthService);
    // Avoid browser navigation while exercising the actual logout cleanup.
    (auth as any).document = { location: { href: '' } };
    auth.logout('/');
    expect(storage['token']).toBeUndefined(); expect(storage['user']).toBeUndefined();
    expect(storage['currentContext_v1']).toBeUndefined();
    expect(JSON.parse(storage[ENTITY_PREFERENCES_KEY])['9']).toBe('b');
    storage['user'] = JSON.stringify({ id: 9 });
    ctx.initFromLogin({ entities: organizations });
    expect(ctx.active()?.context?.id).toBe('b');
    delete storage['currentContext_v1']; storage['user'] = JSON.stringify({ id: 10 });
    ctx.initFromLogin({ entities: organizations });
    expect(ctx.active()?.context?.id).toBe('a');
  });
  it('allows draft selection and emits a one-time entry intent for the selected entity', () => {
    const fixture = header();
    fixture.componentInstance.switchContext('entity-manager', 'b', new MouseEvent('click'));
    respond({ ...organizations[1], status: 'draft' });
    expect(current.currentEntity().status).toBe('draft');
    const entry = TestBed.inject(OrganizationEntryService);
    expect(entry.consume('b')).toBeTrue(); expect(entry.consume('b')).toBeFalse();
    fixture.destroy();
  });
  it('refreshes notifications immediately on switch and cancels responses from the old organization', () => {
    const notificationRequests: Array<{ id: string; result: Subject<any> }> = [];
    (TestBed.inject(EntitiesService) as any).getNotifications = (id: string) => {
      const result = new Subject<any>(); notificationRequests.push({ id, result }); return result;
    };
    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges(); TestBed.flushEffects();
    expect(notificationRequests[0].id).toBe('a');
    fixture.componentInstance.notifications = [{ id: 'old' } as any];
    fixture.componentInstance.count = 1;
    current.selectEntity('b').subscribe(); respond(organizations[1]); fixture.detectChanges();
    expect(notificationRequests[notificationRequests.length - 1].id).toBe('b');
    expect(fixture.componentInstance.notifications).toEqual([]);
    notificationRequests[0].result.next({ notifications: [{ id: 'late-a' }] });
    notificationRequests[notificationRequests.length - 1].result.next({ notifications: [] });
    expect(fixture.componentInstance.count).toBe(0);
    expect(fixture.componentInstance.notifications).toEqual([]);
    fixture.destroy();
  });
  it('reloads campaigns for the selected organization and discards old campaign responses', () => {
    const campaignRequests: Array<{ id: string | undefined; result: Subject<any[]> }> = [];
    spyOn(TestBed.inject(CampaignApiService), 'list').and.callFake((id?: string) => {
      const result = new Subject<any[]>(); campaignRequests.push({ id, result }); return result;
    });
    const fixture = TestBed.createComponent(CampaignsPageComponent); fixture.detectChanges();
    expect(campaignRequests[0].id).toBe('a');
    campaignRequests[0].result.next([{ id: 'campaign-a', status: 'draft' }]);
    expect(fixture.componentInstance.campaigns[0].id).toBe('campaign-a');
    current.selectEntity('b').subscribe(); respond(organizations[1]); fixture.detectChanges();
    expect(fixture.componentInstance.campaigns).toEqual([]);
    expect(campaignRequests[campaignRequests.length - 1].id).toBe('b');
    campaignRequests[0].result.next([{ id: 'late-campaign-a' }]);
    campaignRequests[campaignRequests.length - 1].result.next([{ id: 'campaign-b' }]);
    expect(fixture.componentInstance.campaigns.map(c => c.id)).toEqual(['campaign-b']);
    fixture.destroy();
  });
});

