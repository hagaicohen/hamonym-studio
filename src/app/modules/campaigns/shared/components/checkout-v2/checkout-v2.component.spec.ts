import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CheckoutV2Component } from './checkout-v2.component';
import { CampaignStudioStateService, Offering } from '../../../services/campaign-studio-state.service';
import { DonationService, DonationResult } from '../../../services/donation.service';

// Reward Checkout amount bug fix (2026-10-06). Root cause: step1Valid only
// ever checked explicitAmount (the normal donation amount picker's own
// state), never cartOfferings -- so a donor who selected a ₪250 Reward and
// nothing else saw the footer correctly show ₪250 (chargeAmount already
// included cartOfferingsTotal) while "המשך לפרטים אישיים" stayed disabled,
// because explicitAmount was still 0. isRewardMode is the new single
// switch everything branches on; these tests cover both the fixed Reward
// path and the unchanged normal-donation path side by side.
describe('CheckoutV2Component — Reward Checkout amount fix', () => {
  let donationService: DonationService;

  function render(opts: {
    offerings?: Offering[];
    initialAmount?: number;
    initialFrequency?: 'one-time' | 'monthly';
    ambassador?: any;
  } = {}) {
    TestBed.configureTestingModule({
      imports: [CheckoutV2Component, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CheckoutV2Component);
    const state = TestBed.inject(CampaignStudioStateService);
    donationService = TestBed.inject(DonationService);

    const component = fixture.componentInstance;
    component.draft = { ...state.draft, id: 'camp-1' };
    component.cartOfferings = opts.offerings ?? [];
    component.initialAmount = opts.initialAmount ?? 0;
    component.initialFrequency = opts.initialFrequency ?? 'one-time';
    component.ambassador = opts.ambassador ?? null;
    component.entityLogoUrl = null;

    fixture.detectChanges(); // runs ngOnInit
    return { fixture, component };
  }

  const reward250: Offering = { id: 'r1', title: 'ספר האדם מחפש משמעות', description: '', minimumAmount: 250, stock: null, imageUrl: null };
  const reward500: Offering = { id: 'r2', title: 'חולצת תמיכה', description: '', minimumAmount: 500, stock: null, imageUrl: null };

  // ── 1/18/19/20 — normal donation flow is unchanged ──
  it('1/18. normal donation (no reward) still requires an explicitly selected amount for step1Valid', () => {
    const { component } = render();
    expect(component.isRewardMode).toBe(false);
    expect(component.step1Valid).toBe(false);
    component.selectAmount(100);
    expect(component.step1Valid).toBe(true);
    expect(component.chargeAmount).toBe(100);
  });

  it('18. ordinary one-time donation commitment text/sub-label are unchanged', () => {
    const { component } = render();
    component.selectAmount(180);
    expect(component.commitmentText).toBe('₪180');
    expect(component.commitmentSubLabel).toBe('תרומה חד פעמית');
  });

  it('19. ordinary monthly donation flow is unchanged (still requires valid installments)', () => {
    const { component } = render();
    component.selectFrequency('monthly');
    component.selectAmount(36);
    expect(component.step1Valid).toBe(false); // no installments chosen yet
    component.selectInstallments(12);
    expect(component.step1Valid).toBe(true);
    expect(component.commitmentText).toBe('₪36 לחודש × 12 חודשים');
    expect(component.commitmentSubLabel).toBe('תרומה חודשית');
  });

  it('20. financial snapshot reuse (no reward) is unchanged -- amount/frequency/installments alone still gate reuse', () => {
    const { component } = render();
    component.selectAmount(100);
    (component as any).donationId = 'd1';
    (component as any).lowProfileId = 'lp1';
    (component as any).createdTermsSnapshot = { amount: 100, frequency: 'one-time', installments: null, offeringIds: '' };
    expect((component as any).canReuseExistingDonation()).toBe(true);
    component.selectAmount(200);
    expect((component as any).canReuseExistingDonation()).toBe(false);
  });

  // ── 2/3 — the actual bug fix ──
  it('2. a selected ₪250 reward makes Step 1 financially valid without any normal amount selected', () => {
    const { component } = render({ offerings: [reward250] });
    expect(component.isRewardMode).toBe(true);
    expect(component.explicitAmount).toBe(0);
    expect(component.step1Valid).toBe(true);
    expect(component.chargeAmount).toBe(250);
  });

  it('3. goToStep2 actually advances past Step 1 for a valid selected reward', () => {
    const { component } = render({ offerings: [reward250] });
    component.goToStep2();
    expect(component.step).toBe(2);
  });

  // ── 4/5/6 — normal controls suppressed in reward mode ──
  it('4/5. reward mode does not render the normal amount buttons or custom amount input', () => {
    const { fixture } = render({ offerings: [reward250] });
    expect(fixture.nativeElement.querySelector('.cv2-amounts')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cv2-custom-amount-wrap')).toBeNull();
  });

  it('6. reward mode does not offer monthly recurring frequency, and forces one-time even if initialFrequency was monthly', () => {
    const { fixture, component } = render({ offerings: [reward250], initialFrequency: 'monthly' });
    expect(fixture.nativeElement.querySelector('.cv2-frequency-toggle')).toBeNull();
    expect(component.donationFrequency).toBe('one-time');
  });

  // ── 7/8/9 — reward summary content ──
  it('7/8. reward mode displays the selected reward\'s title and amount', () => {
    const { fixture } = render({ offerings: [reward250] });
    const item = fixture.nativeElement.querySelector('.cv2-reward-summary-item');
    expect(item.querySelector('.cv2-reward-summary-title').textContent.trim()).toBe('ספר האדם מחפש משמעות');
    expect(item.querySelector('.cv2-reward-summary-amount').textContent.trim()).toBe('₪250');
  });

  it('9. reward mode does not describe the choice as merely "תרומה חד פעמית"', () => {
    const { component } = render({ offerings: [reward250] });
    expect(component.commitmentSubLabel).not.toBe('תרומה חד פעמית');
    expect(component.commitmentSubLabel).toContain('ספר האדם מחפש משמעות');
  });

  // ── 10/11/12/15/16 — the actual payload sent to createDonation ──
  function fillStep2Required(component: CheckoutV2Component): void {
    component.name = 'ישראל ישראלי';
    component.email = 'test@example.com';
    component.phone = '0501234567';
    component.address = 'רחוב הדוגמה 1'; // DEFAULT_DONOR_FIELDS.showAddress is true
  }

  it('10/11/12/15. createDonation receives exactly the reward amount, never combined with a stale/default normal amount, with reward identity attached', () => {
    const { component } = render({ offerings: [reward250], initialAmount: 500 }); // stale/default normal amount present as an input
    const createSpy = spyOn(donationService, 'create').and.returnValue(
      of({ url: 'https://pay', donationId: 'd1', lowProfileId: 'lp1' } as DonationResult),
    );
    fillStep2Required(component);
    component.goToStep3();

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.calls.mostRecent().args[0];
    expect(payload.amount).toBe(250); // not 250+500
    expect(payload.rewards).toEqual([{ id: 'r1', title: 'ספר האדם מחפש משמעות', minimumAmount: 250 }]);
    expect(payload.recurring).toBeUndefined();
  });

  it('16. ambassador attribution is preserved on a reward-mode donation payload', () => {
    const { component } = render({ offerings: [reward250], ambassador: { id: 'amb-1', fullName: 'שגריר בדיקה' } as any });
    const createSpy = spyOn(donationService, 'create').and.returnValue(
      of({ url: 'https://pay', donationId: 'd1', lowProfileId: 'lp1' } as DonationResult),
    );
    fillStep2Required(component);
    component.goToStep3();

    const payload = createSpy.calls.mostRecent().args[0];
    expect(payload.ambassadorId).toBe('amb-1');
    expect(payload.amount).toBe(250);
  });

  // ── 13 — back navigation preserves reward + amount ──
  it('13. going back from Step 2 to Step 1 preserves the selected reward and its amount', () => {
    const { component } = render({ offerings: [reward250] });
    component.goToStep2();
    expect(component.step).toBe(2);
    component.goBack();
    expect(component.step).toBe(1);
    expect(component.cartOfferings).toEqual([reward250]);
    expect(component.chargeAmount).toBe(250);
    expect(component.step1Valid).toBe(true);
  });

  // ── 14 — changing reward must not reuse stale financial state ──
  it('14. a different reward (same total) does not reuse a Donation/LowProfile created for the previous reward', () => {
    const { component } = render({ offerings: [reward250] });
    (component as any).donationId = 'd-for-r1';
    (component as any).lowProfileId = 'lp-for-r1';
    (component as any).createdTermsSnapshot = {
      amount: 250, frequency: 'one-time', installments: null, offeringIds: 'r1',
    };
    expect((component as any).canReuseExistingDonation()).toBe(true); // same reward still -> reuse is correct

    // Swap to a DIFFERENT reward that happens to cost the same ₪250 total
    // combination is irrelevant here -- just confirm identity, not amount, is what changes.
    const sameAmountDifferentReward: Offering = { id: 'r3', title: 'תשורה אחרת', description: '', minimumAmount: 250, stock: null, imageUrl: null };
    component.cartOfferings = [sameAmountDifferentReward];
    expect((component as any).canReuseExistingDonation()).toBe(false);
  });

  it('changing to a higher-priced reward (r2, ₪500) also correctly invalidates reuse', () => {
    const { component } = render({ offerings: [reward250] });
    (component as any).donationId = 'd-for-r1';
    (component as any).lowProfileId = 'lp-for-r1';
    (component as any).createdTermsSnapshot = {
      amount: 250, frequency: 'one-time', installments: null, offeringIds: 'r1',
    };
    component.cartOfferings = [reward500];
    expect(component.chargeAmount).toBe(500);
    expect((component as any).canReuseExistingDonation()).toBe(false);
  });

  // ── Post-payment cart/stock staleness fix (2026-10-06) ──
  // "I selected a reward, paid, came back to the page, and it was still in
  // the 'continue to pay' state even though I already paid; it should also
  // check whether it's now sold out." Root cause: cartOfferings is never
  // mutated from inside checkout, so nothing told the parent (which owns
  // cartOfferingIds/rewardCounts) that a purchase just happened -- fixed via
  // a new paymentSucceeded output, emitted exactly once per confirmed
  // payment, carrying the purchased offering ids back to the parent.
  describe('paymentSucceeded output', () => {
    it('emits with the purchased offering ids once the backend confirms the OpenFields payment as paid', () => {
      const { component } = render({ offerings: [reward250] });
      const emitted: { offeringIds: string[] }[] = [];
      component.paymentSucceeded.subscribe(e => emitted.push(e));
      (component as any).donationId = 'd1';

      spyOn(TestBed.inject(DonationService), 'getStatus').and.returnValue(
        of({ status: 'paid', receipt_id: 'rcpt-1' } as any),
      );
      (component as any).pollConfirmation();

      expect(emitted).toEqual([{ offeringIds: ['r1'] }]);
      expect(component.paymentState).toBe('paid');
    });

    it('does NOT emit for an ordinary pending/failed poll result', () => {
      const { component } = render({ offerings: [reward250] });
      const emitted: { offeringIds: string[] }[] = [];
      component.paymentSucceeded.subscribe(e => emitted.push(e));
      (component as any).donationId = 'd1';

      spyOn(TestBed.inject(DonationService), 'getStatus').and.returnValue(
        of({ status: 'pending' } as any),
      );
      (component as any).pollConfirmation();

      expect(emitted).toEqual([]);
    });

    it('does NOT emit for a normal donation (no reward) -- offeringIds is simply empty, not skipped', () => {
      const { component } = render(); // no offerings
      const emitted: { offeringIds: string[] }[] = [];
      component.paymentSucceeded.subscribe(e => emitted.push(e));
      (component as any).donationId = 'd1';

      spyOn(TestBed.inject(DonationService), 'getStatus').and.returnValue(
        of({ status: 'paid', receipt_id: 'rcpt-1' } as any),
      );
      (component as any).pollConfirmation();

      expect(emitted).toEqual([{ offeringIds: [] }]);
    });
  });

  // ── Success screen regression (2026-10-06) ──
  // "After paying for a reward it tells me my donation of ₪0 was received."
  // Root cause: the success screen's own amount/wording read the LIVE
  // chargeAmount/isRewardMode/cartOfferings getters -- but paymentSucceeded
  // (above) is exactly what the PARENT listens to in order to clear the
  // just-bought offering out of its own cartOfferingIds, which flows
  // straight back into this component's [cartOfferings] @Input on the next
  // change detection tick, all while this exact success screen is still on
  // screen (the drawer never closes/navigates on its own). By the time
  // Angular re-rendered, cartOfferings was already [], so chargeAmount/
  // isRewardMode had already collapsed to 0/false. paidSnapshot fixes this
  // by freezing the numbers the instant 'paid' is confirmed, strictly
  // BEFORE paymentSucceeded is emitted.
  describe('success screen (paidSnapshot) survives the parent clearing cartOfferings', () => {
    function simulateParentClearingCartOnPaymentSucceeded(component: CheckoutV2Component): void {
      component.paymentSucceeded.subscribe(() => {
        component.cartOfferings = []; // exactly what onCheckoutPaymentSucceeded() causes in the real parent
      });
    }

    it('still shows the correct ₪250 reward amount, not ₪0, once cartOfferings has been cleared out from under it', () => {
      const { component } = render({ offerings: [reward250] });
      simulateParentClearingCartOnPaymentSucceeded(component);
      (component as any).donationId = 'd1';
      spyOn(TestBed.inject(DonationService), 'getStatus').and.returnValue(
        of({ status: 'paid', receipt_id: 'rcpt-1' } as any),
      );

      (component as any).pollConfirmation();

      expect(component.cartOfferings).toEqual([]); // confirms the parent-clearing side effect really happened
      expect(component.successMessage).toContain('₪250');
      expect(component.successMessage).not.toContain('₪0');
    });

    it('still frames a reward purchase as a purchase, not "תרומתך" (your donation), after the cart was cleared', () => {
      const { component } = render({ offerings: [reward250] });
      simulateParentClearingCartOnPaymentSucceeded(component);
      (component as any).donationId = 'd1';
      spyOn(TestBed.inject(DonationService), 'getStatus').and.returnValue(
        of({ status: 'paid', receipt_id: 'rcpt-1' } as any),
      );

      (component as any).pollConfirmation();

      expect(component.successMessage).toContain('ספר האדם מחפש משמעות');
      expect(component.successMessage).not.toContain('תרומתך');
    });

    it('a normal (non-reward) donation keeps the ordinary "תרומתך" success wording', () => {
      const { component } = render(); // no offerings
      component.selectAmount(180);
      (component as any).donationId = 'd1';
      spyOn(TestBed.inject(DonationService), 'getStatus').and.returnValue(
        of({ status: 'paid', receipt_id: 'rcpt-1' } as any),
      );

      (component as any).pollConfirmation();

      expect(component.successMessage).toBe('תרומתך בסך ₪180 התקבלה בהצלחה.');
    });
  });
});
