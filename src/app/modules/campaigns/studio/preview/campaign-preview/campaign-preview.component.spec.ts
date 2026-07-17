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
