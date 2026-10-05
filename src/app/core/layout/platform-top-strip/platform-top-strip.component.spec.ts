import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { PlatformTopStripComponent } from './platform-top-strip.component';

// Platform Navigation Cleanup (2026-10-06) — the Top Strip is the single
// platform nav surface above public campaign pages. These tests cover the
// three audiences (anonymous, authenticated non-manager, authorized
// manager) and the two new nav actions ("לכל הקמפיינים" always, "ניהול
// הקמפיין" only when the caller passes a campaign id).
describe('PlatformTopStripComponent', () => {
  function render(manageCampaignId: string | null = null) {
    TestBed.configureTestingModule({
      imports: [PlatformTopStripComponent],
      providers: [provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(PlatformTopStripComponent);
    if (manageCampaignId !== null) {
      fixture.componentRef.setInput('manageCampaignId', manageCampaignId);
    }
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => localStorage.removeItem('token'));

  it('an anonymous visitor sees "לכל הקמפיינים"', () => {
    const fixture = render();
    const link = fixture.nativeElement.querySelector('.pts-discover');
    expect(link?.textContent?.trim()).toBe('לכל הקמפיינים');
  });

  it('an anonymous visitor sees "אזור אישי" entry (as "כניסה / אזור אישי")', () => {
    const fixture = render();
    const btn = fixture.nativeElement.querySelector('.pts-login');
    expect(btn?.textContent?.trim()).toBe('כניסה / אזור אישי');
  });

  it('an anonymous visitor does NOT see "ניהול הקמפיין"', () => {
    const fixture = render();
    expect(fixture.nativeElement.querySelector('.pts-manage')).toBeNull();
  });

  it('an authenticated non-manager (no manageCampaignId passed) does NOT see "ניהול הקמפיין"', () => {
    localStorage.setItem('token', 'fake-token');
    const fixture = render(); // caller never passes an id for a non-manager
    expect(fixture.nativeElement.querySelector('.pts-manage')).toBeNull();
    const btn = fixture.nativeElement.querySelector('.pts-login');
    expect(btn?.textContent?.trim()).toBe('אזור אישי');
  });

  it('an authorized campaign manager sees "ניהול הקמפיין"', () => {
    localStorage.setItem('token', 'fake-token');
    const fixture = render('11111111-1111-1111-1111-111111111111');
    const link = fixture.nativeElement.querySelector('.pts-manage');
    expect(link?.textContent?.trim()).toBe('ניהול הקמפיין');
  });

  it('"ניהול הקמפיין" navigates to the campaign\'s own Workspace dashboard', () => {
    const fixture = render('22222222-2222-2222-2222-222222222222');
    const router = TestBed.inject(Router);
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.pts-manage');
    expect(link.getAttribute('href')).toBe('/campaigns/22222222-2222-2222-2222-222222222222/dashboard');
    void router; // UrlTree assembled via routerLink; href above is the authoritative check here.
  });

  it('"לכל הקמפיינים" navigates to the public Discover route', () => {
    const fixture = render();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.pts-discover');
    expect(link.getAttribute('href')).toBe('/campaigns/discover');
  });

  it('the Hamonym brand/logo still points at the real hamonym.com home, unchanged', () => {
    const fixture = render();
    const home: HTMLAnchorElement = fixture.nativeElement.querySelector('.pts-home');
    expect(home.getAttribute('href')).toBe('https://hamonym.com/');
  });

  it('existing "אזור אישי" behavior is untouched: logged-out shows no logout link', () => {
    const anon = render();
    expect(anon.nativeElement.querySelector('.pts-logout')).toBeNull();
  });

  it('existing "אזור אישי" behavior is untouched: logged-in shows a logout link too', () => {
    localStorage.setItem('token', 'fake-token');
    const loggedIn = render();
    expect(loggedIn.nativeElement.querySelector('.pts-logout')).not.toBeNull();
  });

  // Sticky top strip (2026-10-06) -- stays pinned to the top of the viewport
  // while the page scrolls, instead of scrolling away with the rest of the
  // campaign content. Unlike .sidebar-rail's own position:sticky (untestable
  // in Karma -- see campaign-preview.component.spec.ts's own note), this one
  // has no device-width switch that turns it off, so it's reliably testable
  // via getComputedStyle at any viewport width this runner happens to use.
  it('the strip is position:sticky, pinned to the top of its scroll container', () => {
    const fixture = render();
    document.body.appendChild(fixture.nativeElement);
    const strip = fixture.nativeElement.querySelector('.pts-strip') as HTMLElement;
    const style = getComputedStyle(strip);
    expect(style.position).toBe('sticky');
    expect(style.top).toBe('0px');
    document.body.removeChild(fixture.nativeElement);
  });
});
