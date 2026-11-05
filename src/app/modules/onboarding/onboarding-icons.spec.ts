import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { WelcomeComponent } from './pages/welcome/welcome.component';
import { OnboardingComponent } from './pages/onboarding/onboarding.component';

// Template sources of the whole flow (wizard steps included) are checked by
// scripts/test-no-ui-emoji.cjs; these tests cover the rendered result.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;

describe('Onboarding flow uses Lucide line icons, no decorative emoji', () => {
  let storage: Record<string, string>;
  beforeEach(() => {
    storage = {};
    spyOn(localStorage, 'getItem').and.callFake(key => storage[key] ?? null);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
  });

  it('welcome page renders no emoji, signed in or not (menu open)', () => {
    storage['token'] = 'test-token';
    storage['user'] = JSON.stringify({ id: 9, full_name: 'חגי כהן' });
    const fixture = TestBed.createComponent(WelcomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')!.textContent!.trim()).toBe('ברוכים הבאים חגי');
    (el.querySelector('.ctx-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(EMOJI.test(el.textContent!)).toBeFalse();
    fixture.destroy();
  });

  it('welcome: three cards with decorative 1.75 line icons on the brand tokens, greeting and navigation kept', () => {
    const fixture = TestBed.createComponent(WelcomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')!.textContent!.trim()).toBe('ברוכים הבאים');
    const cards = Array.from(el.querySelectorAll('.welcome-card'));
    expect(cards.length).toBe(3);
    for (const card of cards) {
      const box = card.querySelector('.card-icon') as HTMLElement;
      expect(box.getAttribute('aria-hidden')).toBe('true');
      const svg = box.querySelector('svg')!;
      expect(svg.getAttribute('stroke-width')).toBe('1.75');
      expect(svg.getAttribute('width')).toBe('24');
      expect(getComputedStyle(box).color).toBe('rgb(88, 60, 214)');
      expect(getComputedStyle(box).backgroundColor).toBe('rgb(244, 242, 253)');
      expect(card.querySelector('.card-arrow svg')!.getAttribute('stroke-width')).toBe('1.75');
    }
    const navigate = spyOn(TestBed.inject(Router), 'navigate');
    (cards[2] as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/campaigns/discover'], { queryParams: { mode: 'ambassador' } });
    fixture.destroy();
  });

  it('onboarding type selection: four line icons, selection logic unchanged', () => {
    const fixture = TestBed.createComponent(OnboardingComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const icons = Array.from(el.querySelectorAll('.type-card .icon'));
    expect(icons.length).toBe(4);
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.querySelector('svg')!.getAttribute('stroke-width')).toBe('1.75');
      expect(getComputedStyle(icon).width).toBe('56px');
    }
    (el.querySelectorAll('.type-card')[3] as HTMLElement).click();
    expect(fixture.componentInstance.selectedType).toBe('donor');
    fixture.destroy();
  });
});
