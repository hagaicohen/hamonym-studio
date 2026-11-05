import { By } from '@angular/platform-browser';
import { TopbarComponent } from '../../../../core/layout/topbar/topbar.component';
import { DOCUMENT } from '@angular/common';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { WelcomeComponent } from './welcome.component';

describe('Welcome user controls', () => {
  let fixture: ComponentFixture<WelcomeComponent>;
  let storage: Record<string, string>;
  beforeEach(() => {
    storage = {};
    spyOn(localStorage, 'getItem').and.callFake(key => storage[key] ?? null);
    spyOn(localStorage, 'clear').and.callFake(() => { storage = {}; });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
  });
  afterEach(() => fixture?.destroy());
  function render(authenticated = false) {
    if (authenticated) {
      storage['token'] = 'test-token';
      storage['user'] = JSON.stringify({ id: 9, full_name: 'חגי כהן' });
    }
    fixture = TestBed.createComponent(WelcomeComponent);
    fixture.detectChanges();
  }
  function header() { return fixture.debugElement.query(By.directive(TopbarComponent)).componentInstance as TopbarComponent; }
  it('shows generic greeting and login despite a stale stored user without a token', () => {
    storage['user'] = JSON.stringify({ full_name: 'stale-name' });
    render();
    expect(fixture.nativeElement.textContent).toContain('התחברות');
    expect(fixture.nativeElement.querySelector('h1').textContent).not.toContain('stale-name');
    expect(fixture.nativeElement.querySelectorAll('.welcome-card').length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('img[src="/logo.png"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.welcome-logo')).toBeNull();
  });
  it('shows authenticated name and opens the two actions', () => {
    render(true);
    fixture.nativeElement.querySelector('.ctx-btn').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ctx-btn').textContent).toContain('חגי כהן');
    expect(fixture.nativeElement.querySelector('.ctx-btn').getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelectorAll('.ctx-dropdown button').length).toBe(2);
  });
  it('closes on outside click and Escape restores trigger focus', () => {
    render(true);
    header().toggleDropdown(new MouseEvent("click")); fixture.detectChanges();
    document.body.click(); fixture.detectChanges();
    expect(header().dropdownOpen).toBeFalse();
    header().toggleDropdown(new MouseEvent("click")); fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.ctx-btn');
    spyOn(trigger, 'focus');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(header().dropdownOpen).toBeFalse();
    expect(trigger.focus).toHaveBeenCalled();
  });
  it('closes when keyboard focus leaves the control', () => {
    render(true); header().toggleDropdown(new MouseEvent("click")); fixture.detectChanges();
    const control = fixture.nativeElement.querySelector('.ctx-wrapper');
    control.dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body }));
    expect(header().dropdownOpen).toBeFalse();
  });
  it('uses existing login and donor personal area routes', () => {
    render();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    header().login();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/' } });
    header().navigateTo("/my-donations", new MouseEvent("click"));
    expect(navigate).toHaveBeenCalledWith(['/my-donations']);
  });
  it('delegates logout to AuthService with the public root destination', () => {
    render(true);
    const logout = spyOn(TestBed.inject(AuthService), 'logout');
    header().logout();
    expect(logout).toHaveBeenCalledOnceWith('/');
  });
  it('retains the three original option destinations', () => {
    render();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    for (const card of fixture.componentInstance.cards) fixture.componentInstance.select(card);
    expect(navigate).toHaveBeenCalledWith(['/organization-registration'], { queryParams: {} });
    expect(navigate).toHaveBeenCalledWith(['/campaigns/discover'], { queryParams: {} });
    expect(navigate).toHaveBeenCalledWith(['/campaigns/discover'], { queryParams: { mode: 'ambassador' } });
  });
});

describe('Existing AuthService logout persistence', () => {
  it('clears authentication and context, returns home and stays logged out after service recreation', () => {
    let storage: Record<string, string> = { token: 'test-token', user: JSON.stringify({ full_name: 'חגי כהן' }), adminMode: 'true', impersonatorToken: 'old' };
    spyOn(localStorage, 'getItem').and.callFake(key => storage[key] ?? null);
    spyOn(localStorage, 'clear').and.callFake(() => { storage = {}; });
    const location = { href: '/welcome' };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([]), { provide: DOCUMENT, useValue: { location } }] });
    const auth = TestBed.inject(AuthService);
    expect(auth.getToken()).toBe('test-token');
    auth.logout('/');
    expect(location.href).toBe('/');
    expect(storage).toEqual({});
    expect(auth.currentUser()).toBeNull();
    const fresh = TestBed.runInInjectionContext(() => new AuthService(TestBed.inject(HttpClient), TestBed.inject(Router)));
    expect(fresh.getToken()).toBeNull();
    expect(fresh.currentUser()).toBeNull();
  });
});

