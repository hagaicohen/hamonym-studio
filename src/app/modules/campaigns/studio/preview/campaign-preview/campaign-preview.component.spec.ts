import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignPreviewComponent } from './campaign-preview.component';
import { CampaignStudioStateService, Offering } from '../../../services/campaign-studio-state.service';

// Offering is a pure gift/perk concept again — always goes to the cart.
// Registration is a separate Action (startRegistration), not routed through
// the Offerings grid at all. See DECISIONS.md (2026-07-16).
describe('CampaignPreviewComponent — offerings cart / registration action', () => {
  let component: CampaignPreviewComponent;

  const perkA: Offering = {
    id: 'p1', title: 'תשורה א', description: '',
    minimumAmount: 100, stock: null, imageUrl: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
    // Deliberately not calling fixture.detectChanges() — these tests exercise
    // the cart/checkout methods directly, not the rendered template or ngOnInit.
  });

  function draftWith(offerings: Offering[]) {
    const state = TestBed.inject(CampaignStudioStateService);
    return { ...state.draft, offerings };
  }

  it('selecting an offering adds it to the cart', () => {
    const draft = draftWith([perkA]);
    component.selectOffering(perkA, draft);

    expect(component.cartOfferingIds.has(perkA.id)).toBe(true);
    expect(component.checkoutOpen).toBe(false);
  });

  it('offerings still multi-select normally', () => {
    const perkB: Offering = { ...perkA, id: 'p2', title: 'תשורה ב', minimumAmount: 40 };
    const draft = draftWith([perkA, perkB]);
    component.selectOffering(perkA, draft);
    component.selectOffering(perkB, draft);

    expect(component.cartOfferingIds.size).toBe(2);
    expect(component.totalAmount(draft)).toBe(140);
  });

  it('totalAmount is explicitAmount + cart total', () => {
    const draft = draftWith([perkA]);
    component.selectAmount(200);
    component.selectOffering(perkA, draft);

    expect(component.totalAmount(draft)).toBe(300);
  });

  it('startRegistration opens checkout directly in registration mode', () => {
    component.startRegistration();

    expect(component.checkoutOpen).toBe(true);
    expect(component.checkoutMode).toBe('registration');
  });

  it('closeCheckout resets registration mode back to donation', () => {
    component.startRegistration();
    component.closeCheckout();

    expect(component.checkoutOpen).toBe(false);
    expect(component.checkoutMode).toBe('donation');
  });
});

// A suggested/default amount is never financial consent (2026-09-21 product
// decision). Before this fix, openCheckout() silently assigned
// getEffectiveAmount()'s "middle suggested amount" fallback into
// selectedAmount -- a donor who picked ONLY a reward, never touching the
// amount picker, reached checkout owing reward price + an untouched
// suggestion they never selected. Only selectedAmount/customAmount (values
// the donor actually chose) may ever contribute to the payable total.
describe('CampaignPreviewComponent — amount-intent invariant (suggested amount is not consent)', () => {
  let component: CampaignPreviewComponent;

  const rewardA: Offering = {
    id: 'r1', title: 'תשורת E2E', description: '',
    minimumAmount: 100, stock: null, imageUrl: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWith(offerings: Offering[]) {
    const state = TestBed.inject(CampaignStudioStateService);
    // suggestedAmounts must be non-empty so getEffectiveAmount()'s fallback
    // would have returned a non-zero "middle suggestion" if it were still
    // being used -- proves these tests actually exercise the fixed path,
    // not merely a case where the old fallback happened to be 0 anyway.
    return { ...state.draft, offerings, suggestedAmounts: [50, 100, 180, 360, 500] };
  }

  it('A. reward selected alone, amount picker never touched -> total is exactly the reward price', () => {
    const draft = draftWith([rewardA]);
    component.selectOffering(rewardA, draft);

    expect(component.selectedAmount).toBeNull();
    expect(component.explicitAmount).toBe(0);
    expect(component.totalAmount(draft)).toBe(100);

    component.openCheckout(draft);
    expect(component.checkoutOpen).toBe(true);
    expect(component.selectedAmount).toBeNull('openCheckout must not invent a base amount');
    expect(component.totalAmount(draft)).toBe(100);
  });

  it('B. donor explicitly selects ₪180, then adds the ₪100 reward -> total is 280', () => {
    const draft = draftWith([rewardA]);
    component.selectAmount(180);
    component.selectOffering(rewardA, draft);

    expect(component.totalAmount(draft)).toBe(280);
    component.openCheckout(draft);
    expect(component.totalAmount(draft)).toBe(280);
  });

  it('C. donor selects the ₪100 reward, then explicitly adds ₪50 -> total is 150', () => {
    const draft = draftWith([rewardA]);
    component.selectOffering(rewardA, draft);
    component.selectAmount(50);

    expect(component.totalAmount(draft)).toBe(150);
    component.openCheckout(draft);
    expect(component.totalAmount(draft)).toBe(150);
  });

  it('D. normal donation flow with no reward is unaffected -- explicit amount still opens checkout for exactly that amount', () => {
    const draft = draftWith([]);
    component.selectAmount(100);

    expect(component.totalAmount(draft)).toBe(100);
    component.openCheckout(draft);
    expect(component.checkoutOpen).toBe(true);
    expect(component.totalAmount(draft)).toBe(100);
  });

  it('E. removing the selected reward drops it back out of the total', () => {
    const draft = draftWith([rewardA]);
    component.selectAmount(50);
    component.selectOffering(rewardA, draft);
    expect(component.totalAmount(draft)).toBe(150);

    component.removeOffering(rewardA.id);
    expect(component.totalAmount(draft)).toBe(50);
  });

  it('F. checkout displays exactly the same total the donor saw immediately before opening it', () => {
    const draft = draftWith([rewardA]);
    component.selectOffering(rewardA, draft);
    const beforeOpen = component.totalAmount(draft);

    component.openCheckout(draft);
    const afterOpen = component.totalAmount(draft);

    expect(afterOpen).toBe(beforeOpen);
    expect(afterOpen).toBe(100);
  });

  it('an untouched suggested amount alone (no reward, no explicit selection) never opens checkout with an invented amount', () => {
    const draft = draftWith([]);
    expect(component.totalAmount(draft)).toBe(0);

    component.openCheckout(draft);
    expect(component.checkoutOpen).toBe(false, 'a zero-intent click must not silently become a payable checkout');
    expect(component.selectedAmount).toBeNull();
  });
});
