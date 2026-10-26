import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CheckoutV2Component } from './checkout-v2.component';
import { OpenfieldsFormComponent } from '../../../../billing/components/openfields-form/openfields-form.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { DonationService } from '../../../services/donation.service';

describe('Original OpenFields checkout stays inside the drawer', () => {
  for (const frequency of ['one-time', 'monthly'] as const) {
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
