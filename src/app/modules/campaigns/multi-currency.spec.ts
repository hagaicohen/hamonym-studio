import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CampaignStudioStateService } from './services/campaign-studio-state.service';
import { DonationCurrencyService } from './services/donation-currency.service';
import { DonationService } from './services/donation.service';
import { CampaignPreviewComponent } from './studio/preview/campaign-preview/campaign-preview.component';
import { CheckoutV2Component } from './shared/components/checkout-v2/checkout-v2.component';
import { DonationSuccessComponent } from './pages/donation-success/donation-success.component';
import { CampaignDonationStepComponent } from './builder/steps/campaign-donation-step/campaign-donation-step.component';
import { DEFAULT_FOREIGN_PRESETS, campaignCurrencies, formatMoney, presetsFor } from './utils/donation-currency';
import { environment } from '../../../environments/environment';

// Multi-currency donations (2026-11): ILS stays the default and unchanged;
// USD/EUR appear only when the campaign offers them AND the platform enables
// them; switching currency never converts an entered amount.

function setup(imports: any[]) {
  TestBed.configureTestingModule({ imports: [...imports, HttpClientTestingModule], providers: [provideRouter([])] });
  const state = TestBed.inject(CampaignStudioStateService);
  const currencies = TestBed.inject(DonationCurrencyService);
  const enable = (currencyList: ('ILS' | 'USD' | 'EUR')[], recurring: ('ILS' | 'USD' | 'EUR')[] = ['ILS']) =>
    currencies.availability.set({ currencies: currencyList, recurringCurrencies: recurring });
  return { state, currencies, enable };
}

describe('Donation currency helpers', () => {
  it('ILS presets are the campaign\'s own; foreign presets are round defaults or the manager\'s own, never converted', () => {
    const { state } = setup([]);
    const d = state.draft;
    expect(presetsFor(d, 'ILS', 'one-time')).toEqual(d.suggestedAmounts);
    expect(presetsFor(d, 'ILS', 'monthly')).toEqual(d.monthlyAmounts);
    expect(presetsFor(d, 'USD', 'one-time')).toEqual(DEFAULT_FOREIGN_PRESETS.USD.oneTime);
    const own = { ...d, layout: { ...d.layout, currencyPresets: { EUR: { oneTime: [20, 40] } } } };
    expect(presetsFor(own, 'EUR', 'one-time')).toEqual([20, 40]);
    expect(campaignCurrencies(d)).toEqual(['ILS']);
    expect(campaignCurrencies({ layout: { ...d.layout, donationCurrencies: ['EUR', 'USD'] } })).toEqual(['ILS', 'USD', 'EUR']);
    expect(formatMoney(1800, 'USD')).toBe('$' + (1800).toLocaleString('he-IL'));
    expect(formatMoney(5)).toBe('₪5');
  });

  it('availability is ILS-only until the server says otherwise, and on error', () => {
    const { currencies } = setup([]);
    const http = TestBed.inject(HttpTestingController);
    expect(currencies.isEnabled('USD')).toBeFalse();
    currencies.load();
    http.expectOne(`${environment.apiUrl}/api/donations/currencies`).flush({ currencies: ['ILS', 'USD', 'GBP'], recurringCurrencies: ['ILS'] });
    expect(currencies.availability().currencies).toEqual(['ILS', 'USD']);
    expect(currencies.isEnabled('USD', true)).toBeFalse();
  });
});

describe('Donation widget currency selector', () => {
  function render({ offer = [] as ('USD' | 'EUR')[], enabled = ['ILS'] as ('ILS' | 'USD' | 'EUR')[], recurring = ['ILS'] as ('ILS' | 'USD' | 'EUR')[], studio = false } = {}) {
    const ctx = setup([CampaignPreviewComponent]);
    ctx.state.patch({ title: 'קמפיין', slug: '', allowMonthlyDonation: true, monthlyAmounts: [50, 100], allowCustomAmount: true,
      layout: { ...ctx.state.draft.layout, donationCurrencies: offer } });
    ctx.state.setPageBuilderActive(studio);
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.detectChanges();
    ctx.enable(enabled, recurring);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const donate = () => el.querySelector('.hm-donate:not(.hm-register)') as HTMLElement;
    return { ...ctx, fixture, el, donate, cmp: fixture.componentInstance };
  }

  it('an ILS-only campaign looks exactly as before: no selector, ₪ presets', () => {
    const { donate } = render({ enabled: ['ILS', 'USD', 'EUR'] });
    expect(donate().querySelector('.hm-currency-switch')).toBeNull();
    expect(donate().querySelector('.hm-amount-preset')!.textContent!.trim()).toMatch(/^₪/);
  });

  it('a campaign offering USD shows ₪ ILS | $ USD once the platform enables it; ILS is selected by default', () => {
    const { donate } = render({ offer: ['USD', 'EUR'], enabled: ['ILS', 'USD'] });
    const buttons = Array.from(donate().querySelectorAll<HTMLButtonElement>('.hm-currency-btn'));
    expect(buttons.map(b => b.textContent!.trim())).toEqual(['₪ILS', '$USD']);
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');
    expect(donate().querySelector('.hm-currency-switch')!.getAttribute('role')).toBe('radiogroup');
  });

  it('the public page never offers a currency the platform has not enabled', () => {
    const { donate } = render({ offer: ['USD'], enabled: ['ILS'] });
    expect(donate().querySelector('.hm-currency-switch')).toBeNull();
  });

  it('in the Studio the campaign\'s choice is shown with a note while the platform has it disabled', () => {
    const { donate } = render({ offer: ['USD'], enabled: ['ILS'], studio: true });
    expect(donate().querySelector('.hm-currency-switch')).not.toBeNull();
    expect(donate().querySelector('.hm-currency-studio-note')!.textContent).toContain('USD');
  });

  it('USD shows USD presets with $, the custom field and totals in $; switching never converts the amount', () => {
    const { donate, cmp, fixture } = render({ offer: ['USD'], enabled: ['ILS', 'USD'] });
    cmp.selectAmount(180);
    cmp.customAmount = 250; cmp.amountDisplay = '250';
    (donate().querySelectorAll<HTMLButtonElement>('.hm-currency-btn')[1]).click();
    fixture.detectChanges();
    expect(cmp.selectedCurrency).toBe('USD');
    expect(cmp.explicitAmount).toBe(0);
    expect(donate().querySelector('.hm-currency-notice')!.textContent).toContain('הסכום נוקה');
    expect(donate().querySelector('.hm-currency-notice')!.getAttribute('aria-live')).toBe('polite');
    const presets = Array.from(donate().querySelectorAll('.hm-amount-preset')).map(b => b.textContent!.trim());
    expect(presets[0]).toBe('$18');
    expect(donate().querySelector('.hm-currency-symbol')!.textContent!.trim()).toBe('$');
  });

  it('gifts stay ILS-only and monthly is off in a currency without recurring support', () => {
    const { cmp, donate, fixture, state } = render({ offer: ['USD'], enabled: ['ILS', 'USD'], recurring: ['ILS'] });
    cmp.selectFrequency('monthly');
    cmp.selectCurrency('USD');
    fixture.detectChanges();
    expect(cmp.donationFrequency).toBe('one-time');
    const monthly = Array.from(donate().querySelectorAll<HTMLButtonElement>('.hm-frequency-btn')).find(b => b.textContent!.includes('חודשית'))!;
    expect(monthly.disabled).toBeTrue();
    cmp.selectOffering({ id: 'o1', title: 'ספר', description: '', minimumAmount: 100, stock: null, imageUrl: null } as any, state.draft);
    expect(cmp.cartCount).toBe(0);
    expect(cmp.currencyNotice).toContain('בשקלים בלבד');
  });

  it('the chosen currency is handed to the checkout', () => {
    const { cmp } = render({ offer: ['EUR'], enabled: ['ILS', 'EUR'] });
    cmp.selectCurrency('EUR');
    expect(cmp.selectedCurrency).toBe('EUR');
    expect(cmp.amountsFor(TestBed.inject(CampaignStudioStateService).draft)).toEqual(DEFAULT_FOREIGN_PRESETS.EUR.oneTime);
  });
});

describe('Checkout V2 currency', () => {
  function render({ currency = 'ILS' as 'ILS' | 'USD' | 'EUR', offer = ['USD', 'EUR'] as ('USD' | 'EUR')[] } = {}) {
    const ctx = setup([CheckoutV2Component]);
    ctx.enable(['ILS', 'USD', 'EUR']);
    const fixture = TestBed.createComponent(CheckoutV2Component);
    const c = fixture.componentInstance;
    c.draft = { ...ctx.state.draft, id: 'camp-1', slug: 'kampein', layout: { ...ctx.state.draft.layout, donationCurrencies: offer } };
    c.initialCurrency = currency;
    c.entityLogoUrl = null;
    fixture.detectChanges();
    return { ...ctx, fixture, c, el: fixture.nativeElement as HTMLElement };
  }

  it('ILS checkout is unchanged: ₪ text, no currency in the request', () => {
    const { c } = render();
    const donations = TestBed.inject(DonationService);
    const create = spyOn(donations, 'create').and.returnValue(of({ url: 'https://example.invalid', donationId: 'd1', lowProfileId: 'lp1' }));
    c.selectAmount(180);
    expect(c.commitmentText).toBe('₪180');
    (c as any).createDonationAndAdvance();
    expect('currency' in create.calls.mostRecent().args[0]).toBeFalse();
  });

  it('USD checkout: $ presets and footer, currency sent to the server, stated on the payment step', () => {
    const { c, fixture, el } = render({ currency: 'USD' });
    const donations = TestBed.inject(DonationService);
    const create = spyOn(donations, 'create').and.returnValue(of({ url: 'https://example.invalid', donationId: 'd1', lowProfileId: 'lp1' }));
    expect(c.amountsFor()).toEqual(DEFAULT_FOREIGN_PRESETS.USD.oneTime);
    c.selectAmount(100);
    expect(c.commitmentText).toBe('$100');
    (c as any).createDonationAndAdvance();
    expect(create.calls.mostRecent().args[0].currency).toBe('USD');
    expect(create.calls.mostRecent().args[0].amount).toBe(100);
    fixture.detectChanges();
    expect(el.querySelector('.cv2-currency-charge')!.textContent).toContain('דולר');
    expect(el.querySelector('.cv2-currency-charge')!.textContent).toContain('$100');
  });

  it('a created payment is not reused after a currency change', () => {
    const { c } = render({ currency: 'USD' });
    spyOn(TestBed.inject(DonationService), 'create').and.returnValue(of({ url: 'https://example.invalid', donationId: 'd1', lowProfileId: 'lp1' }));
    c.selectAmount(100);
    (c as any).createDonationAndAdvance();
    expect((c as any).canReuseExistingDonation()).toBeTrue();
    c.selectCurrency('EUR');
    c.selectAmount(100);
    expect((c as any).canReuseExistingDonation()).toBeFalse();
  });

  it('a reward checkout is ILS-only', () => {
    const ctx = setup([CheckoutV2Component]);
    ctx.enable(['ILS', 'USD']);
    const fixture = TestBed.createComponent(CheckoutV2Component);
    const c = fixture.componentInstance;
    c.draft = { ...ctx.state.draft, id: 'camp-1', layout: { ...ctx.state.draft.layout, donationCurrencies: ['USD'] } };
    c.cartOfferings = [{ id: 'r1', title: 'ספר', description: '', minimumAmount: 250, stock: null, imageUrl: null } as any];
    c.initialCurrency = 'USD';
    fixture.detectChanges();
    expect(c.currency).toBe('ILS');
    expect(c.offeredCurrencies).toEqual(['ILS']);
  });

  it('success navigation carries the currency for USD only', () => {
    const { c } = render({ currency: 'USD' });
    const router = TestBed.inject(Router);
    const nav = spyOn(router, 'navigate').and.resolveTo(true);
    c.selectAmount(50);
    (c as any).donationId = 'd1';
    (c as any).onHostedCheckoutMessage({ origin: window.location.origin, data: { source: 'hamonym-donation-return', status: 'success' } } as MessageEvent);
    expect(nav.calls.mostRecent().args[1]!.queryParams).toEqual({ ref: 'd1', amount: 50, currency: 'USD' });
  });
});

describe('Donation success page currency', () => {
  // Karma runs inside an iframe, where ngOnInit deliberately only signals the
  // parent checkout (see its own comment), so the display is checked directly.
  it('shows the amount in the charged currency, ILS by default', () => {
    TestBed.configureTestingModule({ imports: [DonationSuccessComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    const page = TestBed.createComponent(DonationSuccessComponent).componentInstance;
    page.amount = 180;
    expect(page.formattedAmount).toBe('₪180');
    page.amount = 100; page.currency = 'USD';
    expect(page.formattedAmount).toBe('$100');
    page.amount = 36; page.currency = 'EUR';
    expect(page.formattedAmount).toBe('€36');
  });
});

describe('Studio: campaign donation currencies', () => {
  it('turning on USD stores it with its own presets, ILS presets untouched', () => {
    const { state, enable } = setup([CampaignDonationStepComponent]);
    enable(['ILS']);
    const fixture = TestBed.createComponent(CampaignDonationStepComponent);
    fixture.detectChanges();
    const step = fixture.componentInstance;
    const ilsBefore = [...state.draft.suggestedAmounts];
    step.toggleCurrency('USD');
    expect(state.draft.layout.donationCurrencies).toEqual(['USD']);
    step.updateCurrencyPreset('USD', 0, 25);
    expect(state.draft.layout.currencyPresets?.USD?.oneTime?.[0]).toBe(25);
    expect(state.draft.suggestedAmounts).toEqual(ilsBefore);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('עדיין לא פעיל בפלטפורמה');
    step.toggleCurrency('USD');
    expect(state.draft.layout.donationCurrencies).toEqual([]);
  });
});

describe('Admin donations list amounts', () => {
  it('shows a foreign donation in its own currency with its ILS equivalent, ILS unchanged', async () => {
    const { DonationsPageComponent } = await import('../donations/pages/donations-page/donations-page.component');
    const proto = DonationsPageComponent.prototype as any;
    const fmt = (d: any) => proto.fmtDonationAmount.call({ fmtMoney: proto.fmtMoney }, d);
    expect(fmt({ amount: 180 })).toBe('₪180');
    expect(fmt({ amount: 180, currency: 'ILS', amount_ils: 180 })).toBe('₪180');
    expect(fmt({ amount: 100, currency: 'USD', amount_ils: 319.4 })).toBe('$100 (≈ ₪319)');
    expect(fmt({ amount: 50, currency: 'EUR', amount_ils: null, fx_status: 'pending' })).toBe('€50 (שער בהמתנה)');
  });
});
