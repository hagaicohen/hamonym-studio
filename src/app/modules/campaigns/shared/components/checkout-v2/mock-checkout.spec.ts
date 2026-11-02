import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { CheckoutV2Component } from './checkout-v2.component';
import { OpenfieldsFormComponent } from '../../../../billing/components/openfields-form/openfields-form.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { DonationService } from '../../../services/donation.service';

describe('Original OpenFields checkout stays inside the drawer', () => {
  it('ends status-request loading on timeout without allowing another payment', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [CheckoutV2Component, HttpClientTestingModule], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CheckoutV2Component), component = fixture.componentInstance;
    component.donationId = 'pending-fixture'; component.paymentState = 'uncertain';
    const status = spyOn(TestBed.inject(DonationService), 'getStatus').and.returnValue(NEVER);
    component.recheckPaymentStatus();
    expect(component.statusCheckInProgress).toBeTrue();
    tick(15000);
    expect(component.statusCheckInProgress).toBeFalse();
    expect(component.paymentState).not.toBe('idle');
    expect(component.paymentState).not.toBe('paid');
    expect(status).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));
  it('keeps the form editable when secure-field validation blocks submission before payment', async () => {
    TestBed.configureTestingModule({ imports: [CheckoutV2Component, HttpClientTestingModule], providers: [provideRouter([])] });
    TestBed.overrideComponent(OpenfieldsFormComponent, { set: { template: '' } });
    spyOn(OpenfieldsFormComponent.prototype, 'ngOnInit').and.resolveTo();
    spyOn(OpenfieldsFormComponent.prototype, 'tokenize').and.callFake(async function(this: OpenfieldsFormComponent) {
      this.submissionBlocked = true; this.validationError = 'מספר הכרטיס אינו מלא'; return false;
    });
    const fixture = TestBed.createComponent(CheckoutV2Component), component = fixture.componentInstance;
    component.draft = { ...TestBed.inject(CampaignStudioStateService).draft, id: 'campaign' };
    component.initialAmount = 1500; fixture.detectChanges();
    const service = TestBed.inject(DonationService);
    spyOn(service, 'create').and.returnValue(of({ donationId: 'pending-fixture', lowProfileId: 'fixture', url: 'https://example.invalid/unused' }));
    const status = spyOn(service, 'getStatus');
    (component as any).createDonationAndAdvance(); fixture.detectChanges();
    await component.submitOpenFieldsPayment(); fixture.detectChanges();
    expect(component.paymentState).toBe('idle'); expect(status).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.cv2-success')).toBeNull();
    fixture.destroy();
  });

  for (const frequency of ['one-time', 'monthly'] as const) {
    for (const submitted of [true, false]) {
      it(`never confirms a pending 100000 donation after OpenFields returns ${submitted} for ${frequency}`, async () => {
        TestBed.configureTestingModule({ imports: [CheckoutV2Component, HttpClientTestingModule], providers: [provideRouter([])] });
        TestBed.overrideComponent(OpenfieldsFormComponent, { set: { template: '' } });
        spyOn(OpenfieldsFormComponent.prototype, 'ngOnInit').and.resolveTo();
        spyOn(OpenfieldsFormComponent.prototype, 'tokenize').and.resolveTo(submitted);
        const fixture = TestBed.createComponent(CheckoutV2Component);
        const component = fixture.componentInstance;
        component.draft = { ...TestBed.inject(CampaignStudioStateService).draft, id: 'campaign' };
        component.initialAmount = 100000; component.initialFrequency = frequency;
        fixture.detectChanges();
        const service = TestBed.inject(DonationService);
        spyOn(service, 'create').and.returnValue(of({ donationId: 'original-pending-100000', lowProfileId: 'pending-profile', url: 'https://example.invalid/unused' }));
        const status = spyOn(service, 'getStatus').and.returnValue(of({ status: 'pending', receipt_id: null } as any));
        const success = spyOn(component.paymentSucceeded, 'emit');
        (component as any).createDonationAndAdvance(); fixture.detectChanges();
        await component.submitOpenFieldsPayment(); fixture.detectChanges();
        expect(status).toHaveBeenCalledWith('original-pending-100000');
        expect(component.paymentState).not.toBe('paid');
        expect(fixture.nativeElement.querySelector('.cv2-success')).toBeNull();
        expect(fixture.nativeElement.querySelector('.cv2-payment-status--confirming')).not.toBeNull();
        expect(success).not.toHaveBeenCalled();
        expect(component.receiptId).toBeFalsy();
        fixture.destroy();
      });
    }

    it(`uses the original card component and inline confirmation for ${frequency}`, async () => {
      TestBed.configureTestingModule({ imports: [CheckoutV2Component, HttpClientTestingModule], providers: [provideRouter([])] });
      // No provider frames or external network in isolated tests.
      TestBed.overrideComponent(OpenfieldsFormComponent, { set: { template: '' } });
      spyOn(OpenfieldsFormComponent.prototype, 'ngOnInit').and.resolveTo();
      const tokenize = spyOn(OpenfieldsFormComponent.prototype, 'tokenize').and.resolveTo(true);
      const fixture = TestBed.createComponent(CheckoutV2Component);
      const component = fixture.componentInstance;
      component.draft = { ...TestBed.inject(CampaignStudioStateService).draft, id: 'campaign' };
      component.initialAmount = 100;
      component.initialFrequency = frequency;
      fixture.detectChanges();
      const service = TestBed.inject(DonationService);
      const create = spyOn(service, 'create').and.returnValue(of({
        donationId: 'new-donation', lowProfileId: 'test-low-profile', url: 'https://example.invalid/unused',
      }));
      spyOn(service, 'getStatus').and.returnValue(of({ status: 'paid', receipt_id: 'receipt' } as any));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      (component as any).createDonationAndAdvance();
      fixture.detectChanges();
      expect(create).toHaveBeenCalledTimes(1);
      expect(component.step).toBe(3);
      expect(component.lowProfileId).toBe('test-low-profile');
      expect(fixture.nativeElement.querySelector('app-openfields-form')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#checkout-card-number')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      await component.submitOpenFieldsPayment();
      await component.submitOpenFieldsPayment();
      fixture.detectChanges();
      expect(tokenize).toHaveBeenCalledTimes(1);
      expect(component.paymentState).toBe('paid');
      expect(fixture.nativeElement.querySelector('.cv2-success')).toBeTruthy();
      expect(navigate).not.toHaveBeenCalled();
    });
  }
});
