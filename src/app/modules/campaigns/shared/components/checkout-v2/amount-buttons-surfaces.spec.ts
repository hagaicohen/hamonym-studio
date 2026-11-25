import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CheckoutV2Component } from './checkout-v2.component';
import { MinimalDonationPageComponent } from '../minimal-donation-page/minimal-donation-page.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';

// One amount-button configuration (layout.amountButtons) for Checkout V2 and the
// minimal page too (2026-11-08); absent = their own look, unchanged.
describe('Amount buttons on Checkout V2 and the minimal page', () => {
  const amounts = [50, 100, 180, 250, 360, 500, 720, 1000];

  function checkout(amountButtons?: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [CheckoutV2Component, HttpClientTestingModule], providers: [provideRouter([])] });
    const state = TestBed.inject(CampaignStudioStateService);
    const fixture = TestBed.createComponent(CheckoutV2Component);
    fixture.componentInstance.draft = { ...state.draft, id: 'c1', suggestedAmounts: amounts, layout: { ...state.draft.layout, ...(amountButtons ? { amountButtons } : {}) } } as never;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function minimal(amountButtons?: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [MinimalDonationPageComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    const state = TestBed.inject(CampaignStudioStateService);
    state.patch({ suggestedAmounts: amounts, layout: { ...state.draft.layout, pageFormat: 'minimal', ...(amountButtons ? { amountButtons } : {}) } });
    const fixture = TestBed.createComponent(MinimalDonationPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('Checkout V2 without a configuration keeps its own grid', () => {
    const grid = checkout().querySelector('.cv2-amounts') as HTMLElement;
    expect(grid.classList.contains('hm-ab')).toBeFalse();
  });

  it('Checkout V2 shows all eight amounts as circles, four per row, with the spacing', () => {
    const grid = checkout({ shape: 'circle', columns: 4, gap: 10 }).querySelector('.cv2-amounts') as HTMLElement;
    expect(grid.classList).toContain('hm-ab--circle');
    expect(grid.classList).toContain('hm-ab--cols');
    expect(grid.style.getPropertyValue('--hm-ab-cols')).toBe('4');
    expect(grid.style.gap).toBe('10px');
    expect(grid.querySelectorAll('.cv2-amount-preset').length).toBe(8);
  });

  it('the minimal page uses the same configuration when it renders its own amounts', () => {
    const el = minimal({ shape: 'rounded', size: 'sm' });
    const grid = el.querySelector('.mdp-amounts, .cv2-amounts') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.classList).toContain('hm-ab--rounded');
    expect(grid.classList).toContain('hm-ab--sm');
  });
});
