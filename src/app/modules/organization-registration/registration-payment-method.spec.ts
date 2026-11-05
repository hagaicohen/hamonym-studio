import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { OrganizationRegistrationStateService, buildPayload } from './services/organization-registration-state.service';
import { StepBillingMethodComponent } from './components/step-billing-method/step-billing-method.component';
import { StepReviewComponent } from './components/step-review/step-review.component';
import { BillingService } from './services/billing.service';
import { OpenfieldsFormComponent } from '../billing/components/openfields-form/openfields-form.component';

const savedCardEntity = { id: 'e-1', status: 'draft', billing_provider: 'cardcom', billing_card_ready: true, billing_last4: '4242', exp_month: 12, exp_year: 2030 };

describe('Registration payment method — card entered, then the summary', () => {
  let http: HttpTestingController;
  let state: OrganizationRegistrationStateService;
  const billing = { getMasavConfig: () => of({ config: null }), createEntityBilling: jasmine.createSpy('createEntityBilling') };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StepBillingMethodComponent, StepReviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: BillingService, useValue: billing }],
    });
    TestBed.overrideComponent(OpenfieldsFormComponent, { set: { template: '' } });
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(OrganizationRegistrationStateService);
    state.updateState({ entityId: 'e-1', paymentMethod: 'credit-card' });
  });
  afterEach(() => http.match(() => true));

  const entityLoad = () => http.match((r) => r.method === 'GET' && r.url.endsWith('/api/entities/e-1'));

  function openBillingStep() {
    const fixture = TestBed.createComponent(StepBillingMethodComponent);
    fixture.detectChanges();
    for (const r of entityLoad()) r.flush({ id: 'e-1', status: 'draft' });
    fixture.detectChanges();
    return fixture;
  }

  it('the card saved by the backend reaches the summary as complete', async () => {
    const fixture = openBillingStep();
    const step = fixture.componentInstance;
    const continued = jasmine.createSpy('continue');
    step.continue.subscribe(continued);
    spyOn(step.openfieldsForm!, 'tokenize').and.resolveTo(true);

    const saving = step.savePaymentMethod();
    await Promise.resolve();
    for (const r of entityLoad()) r.flush(savedCardEntity);
    await saving;

    expect(continued).toHaveBeenCalled();
    expect(state.state().billingCard).toEqual({ last4: '4242', expMonth: '12', expYear: '2030' });

    const review = TestBed.createComponent(StepReviewComponent);
    review.detectChanges();
    for (const r of entityLoad()) r.flush(savedCardEntity);
    review.detectChanges();
    const card = review.componentInstance.completionChecks.find((c) => c.label === 'כרטיס אשראי לגביית עמלות');
    expect(card?.ok).toBeTrue();
    expect(review.nativeElement.textContent).not.toContain('לא התקבל אישור לשמירת כרטיס');
  });

  it('back on the payment step, the saved card is shown instead of an empty form', async () => {
    state.updateState({ billingCard: { last4: '4242', expMonth: '12', expYear: '2030' } });
    const fixture = TestBed.createComponent(StepBillingMethodComponent);
    fixture.detectChanges();
    for (const r of entityLoad()) r.flush(savedCardEntity);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-openfields-form')).toBeNull();
    expect(el.querySelector('.token-success')?.textContent).toContain('4242');

    const continued = jasmine.createSpy('continue');
    fixture.componentInstance.continue.subscribe(continued);
    await fixture.componentInstance.savePaymentMethod();
    expect(continued).toHaveBeenCalled();
  });

  it('switching to MASAV sends nothing until the draft is saved; the card stays until then', () => {
    state.updateState({ billingCard: { last4: '4242', expMonth: '12', expYear: '2030' } });
    const fixture = TestBed.createComponent(StepBillingMethodComponent);
    fixture.detectChanges();
    for (const r of entityLoad()) r.flush(savedCardEntity);

    fixture.componentInstance.selectPaymentMethod('masav');
    fixture.detectChanges();
    http.expectNone((r) => r.method !== 'GET');
    expect(state.state().billingCard?.last4).toBe('4242');

    fixture.componentInstance.selectPaymentMethod('credit-card');
    expect(buildPayload(state.state()).billing_method).toBe('credit-card');

    fixture.componentInstance.selectPaymentMethod('masav');
    state.save({ includeBilling: false }).subscribe();
    const patch = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/entities/e-1'));
    expect(patch.request.body.billing_method).toBe('masav');
  });

  it('CardCom success without a card saved by the backend does not continue', async () => {
    const fixture = openBillingStep();
    const step = fixture.componentInstance;
    const continued = jasmine.createSpy('continue');
    step.continue.subscribe(continued);
    spyOn(step.openfieldsForm!, 'tokenize').and.resolveTo(true);

    const saving = step.savePaymentMethod();
    await Promise.resolve();
    for (const r of entityLoad()) r.flush({ id: 'e-1', status: 'draft' });
    await saving;

    expect(continued).not.toHaveBeenCalled();
    expect(state.state().billingCard).toBeNull();
    expect(step.cardError).toBeTruthy();
  });
});

describe('Registration payment method — draft save and reload', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('a reloaded draft restores the saved card and the payment method', () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    state.loadFromEntity({ ...savedCardEntity, billing_method: 'credit-card' });
    expect(state.state().paymentMethod).toBe('credit-card');
    expect(state.state().billingCard?.last4).toBe('4242');

    state.resetState();
    state.loadFromEntity({ id: 'e-2', billing_method: 'masav' });
    expect(state.state().paymentMethod).toBe('masav');
    expect(state.state().billingCard).toBeNull();
  });

  it('a card row the backend does not confirm (no reusable token) is not a saved card', () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    state.loadFromEntity({ ...savedCardEntity, billing_card_ready: false });
    expect(state.state().billingCard).toBeNull();
    state.loadFromEntity({ ...savedCardEntity, billing_card_ready: undefined });
    expect(state.state().billingCard).toBeNull();
  });

  it('draft saves send the billing method: MASAV, or credit card only once a card is saved', () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    expect(buildPayload({ ...state.state(), paymentMethod: 'credit-card' }).billing_method).toBeNull();
    expect(buildPayload({ ...state.state(), paymentMethod: 'credit-card', billingCard: { last4: '1', expMonth: null, expYear: null } }).billing_method).toBe('credit-card');
    expect(buildPayload({ ...state.state(), paymentMethod: 'masav' }).billing_method).toBe('masav');
  });

  it('no card number or CVV is ever part of a save', () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    const payload = JSON.stringify(buildPayload({ ...state.state(), cardNumber: '4580000000000000', cvv: '123' }));
    expect(payload).not.toContain('4580000000000000');
    expect(payload).not.toContain('"123"');
  });
});

describe('OpenfieldsFormComponent — registration wizard', () => {
  it('saves the card through POST /api/billing even when CardCom returns no deal number (CreateTokenOnly)', async () => {
    const createEntityBilling = jasmine.createSpy('createEntityBilling').and.returnValue(of({ id: 'b-1' }));
    TestBed.configureTestingModule({
      imports: [OpenfieldsFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: BillingService, useValue: { createEntityBilling } }],
    });
    const fixture = TestBed.createComponent(OpenfieldsFormComponent);
    const form = fixture.componentInstance;
    form.entityId = 'e-1';
    form.lowProfileId = 'lp-1';
    form.initState = 'initialized';
    const frame = document.createElement('iframe');
    frame.id = 'CardComMasterFrame';
    document.body.appendChild(frame);
    spyOn(frame.contentWindow!, 'postMessage');

    const result = form.tokenize();
    window.dispatchEvent(new MessageEvent('message', { data: { action: 'HandleSubmit', data: { IsSuccess: true } } }));

    expect(await result).toBeTrue();
    expect(createEntityBilling).toHaveBeenCalledWith(jasmine.objectContaining({ entityId: 'e-1', lowProfileId: 'lp-1', provider: 'cardcom' }));
    frame.remove();
  });
});
