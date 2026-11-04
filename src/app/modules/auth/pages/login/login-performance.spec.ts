import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { LoginComponent } from './login.component';
import { EntitiesService } from '../../../../core/services/entities.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AmbassadorService } from '../../../campaigns/services/ambassador.service';
import { DonationService } from '../../../campaigns/services/donation.service';
import { environment } from '../../../../../environments/environment';
import { NgZone, signal } from '@angular/core';

describe('Login critical-path performance', () => {
  let storage: Record<string, string>;
  let donations: Subject<any[]>;
  let component: LoginComponent;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  beforeEach(() => {
    storage = {};
    spyOn(localStorage, 'getItem').and.callFake(key => storage[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key, value) => { storage[key] = value; });
    spyOn(localStorage, 'removeItem').and.callFake(key => { delete storage[key]; });
    donations = new Subject<any[]>();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), FormBuilder,
      { provide: EntitiesService, useValue: { getMyEntities: () => of({ entities: [{ id: 'org', display_name: 'Org', role: 'owner' }] }) } },
      { provide: CurrentEntityService, useValue: { currentEntity: signal(null), setRole: () => {} } },
      { provide: AmbassadorService, useValue: { getMyCampaigns: () => of([]) } },
      { provide: DonationService, useValue: { getMyDonations: () => donations } },
    ] });
    component = TestBed.runInInjectionContext(() => new LoginComponent(TestBed.inject(FormBuilder), TestBed.inject(HttpClient), TestBed.inject(Router), TestBed.inject(ActivatedRoute)));
    component.loginForm.setValue({ email: 'owner@example.test', password: 'password' });
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });
  afterEach(() => { donations.complete(); http.verify(); });
  for (const method of ['password', 'google']) {
    it(`${method}: navigates without waiting for slow donation history and later restores donor role`, () => {
      if (method === 'password') component.submit(); else component.handleGoogleLogin('google-test');
      http.expectOne(`${environment.apiUrl}/auth/${method === 'password' ? 'login' : 'google'}`).flush({ token: 'new-token', user: { id: 1 }, hasEntities: true });
      expect(navigate).toHaveBeenCalledWith(['/dashboard']);
      expect(component.loading).toBeFalse();
      const context = TestBed.inject(CurrentContextService);
      expect(context.active()?.context?.id).toBe('org');
      donations.next([{ id: 'donation' }]);
      donations.next([{ id: 'donation' }]);
      expect(context.roles().some(group => group.role === 'donor')).toBeTrue();
      expect(context.roles().filter(group => group.role === 'donor').length).toBe(1);
      expect(context.active()?.context?.id).toBe('org');
      expect(navigate.calls.count()).toBe(1);
    });
  }
  it('ignores late donation results after logout or account switch', () => {
    component.submit(); http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: 'new-token', user: { id: 1 } });
    delete storage['token']; donations.next([{ id: 'donation' }]);
    expect(TestBed.inject(CurrentContextService).roles().some(group => group.role === 'donor')).toBeFalse();
  });
  it('restores the chosen organization without temporarily installing the first organization', () => {
    spyOn(TestBed.inject(EntitiesService), 'getMyEntities').and.returnValue(of({ entities: [
      { id: 'first', display_name: 'First', role: 'owner' },
      { id: 'selected', display_name: 'Selected', role: 'owner', status: 'rejected' },
    ] }) as any);
    storage['organizationPreferences_v1'] = JSON.stringify({ '1': 'selected' });
    const setEntity = spyOn(TestBed.inject(CurrentEntityService).currentEntity, 'set').and.callThrough();
    component.submit();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: 'new-token', user: { id: 1 } });
    expect(TestBed.inject(CurrentContextService).active()?.context?.id).toBe('selected');
    expect(setEntity.calls.count()).toBe(1);
    expect((setEntity.calls.mostRecent().args[0] as any).id).toBe('selected');
  });
  it('keeps a noncritical donation-history error from blocking a successful login', () => {
    component.submit(); http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: 'new-token', user: { id: 1 } });
    donations.error(new Error('unavailable'));
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(component.errorMessage).toBe('');
  });
  it('preserves explicit return URLs instead of replacing them with the default dashboard', () => {
    (component as any).returnUrl = '/my-donations';
    const navigateByUrl = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    component.submit(); http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: 'new-token', user: { id: 1 } });
    expect(navigateByUrl).toHaveBeenCalledWith('/my-donations');
    expect(navigate).not.toHaveBeenCalled();
  });
  it('does not navigate or bootstrap roles after failed authentication', () => {
    spyOn(console, 'error');
    component.submit();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ error: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled();
    expect(component.loading).toBeFalse();
    expect(storage['token']).toBeUndefined();
  });
  for (const method of ['password', 'google']) {
    const start = (c: LoginComponent) => method === 'password' ? c.submit() : c.handleGoogleLogin('google-test');
    const url = `${environment.apiUrl}/auth/${method === 'password' ? 'login' : 'google'}`;
    it(`${method}: bounds an unresponsive authentication request and allows retry`, fakeAsync(() => {
      start(component);
      const pending = http.expectOne(url);
      tick(30000);
      expect(pending.cancelled).toBeTrue();
      expect(component.loading).toBeFalse();
      expect(component.errorMessage).toContain('לא השיב בזמן');
      expect(navigate).not.toHaveBeenCalled();
      start(component);
      http.expectOne(url).flush({ token: 'retry-token', user: { id: 1 } });
      expect(component.errorMessage).toBe('');
      expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    }));
    it(`${method}: stops loading after account data fails without pretending no organizations exist`, () => {
      const entities = new Subject<any>();
      spyOn(TestBed.inject(EntitiesService), 'getMyEntities').and.returnValue(entities);
      start(component);
      http.expectOne(url).flush({ token: 'new-token', user: { id: 1 } });
      entities.error(new Error('account request failed'));
      expect(component.loading).toBeFalse();
      expect(component.errorMessage).toContain('טעינת נתוני החשבון נכשלה');
      expect(navigate).not.toHaveBeenCalled();
    });
    it(`${method}: cancels stalled role requests and does not navigate late`, fakeAsync(() => {
      const campaigns = new Subject<any[]>();
      spyOn(TestBed.inject(AmbassadorService), 'getMyCampaigns').and.returnValue(campaigns);
      start(component);
      http.expectOne(url).flush({ token: 'new-token', user: { id: 1 } });
      tick(15000);
      expect(component.loading).toBeFalse();
      expect(component.errorMessage).toContain('טעינת נתוני החשבון נכשלה');
      campaigns.next([]); campaigns.complete();
      expect(navigate).not.toHaveBeenCalled();
    }));
    it(`${method}: ignores duplicate attempts during authentication`, () => {
      start(component); start(component);
      http.expectOne(url).flush({ token: 'new-token', user: { id: 1 } });
      expect(navigate.calls.count()).toBe(1);
    });
  }
  it('runs the external Google callback inside Angular', () => {
    const original = (window as any).google;
    let callback: (response: any) => void = () => {};
    (window as any).google = { accounts: { id: {
      initialize: (options: any) => { callback = options.callback; },
      renderButton: () => {},
    } } };
    try {
      const handler = spyOn(component, 'handleGoogleLogin').and.callFake(() => {
        expect(NgZone.isInAngularZone()).toBeTrue();
      });
      (component as any)._renderGoogleButton();
      TestBed.inject(NgZone).runOutsideAngular(() => callback({ credential: 'test' }));
      expect(handler).toHaveBeenCalledWith('test');
    } finally { (window as any).google = original; }
  });
  it('reports a missing Google credential without sending a request', () => {
    component.handleGoogleLogin('');
    expect(component.loading).toBeFalse();
    expect(component.errorMessage).toContain('לא התקבל אישור');
    http.expectNone(`${environment.apiUrl}/auth/google`);
  });
});
