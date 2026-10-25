import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CheckoutV2Component } from './checkout-v2.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { DonationService } from '../../../services/donation.service';

describe('Mock checkout uses the existing local payment screen', () => {
  for (const frequency of ['one-time', 'monthly'] as const) {
    it(`routes ${frequency} checkout to Mock without loading CardCom`, () => {
      TestBed.configureTestingModule({ imports: [CheckoutV2Component, HttpClientTestingModule], providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(CheckoutV2Component);
      const component = fixture.componentInstance;
      component.draft = { ...TestBed.inject(CampaignStudioStateService).draft, id: 'campaign' };
      component.initialAmount = 100;
      component.initialFrequency = frequency;
      fixture.detectChanges();
      const create = spyOn(TestBed.inject(DonationService), 'create').and.returnValue(of({
        donationId: 'new-donation', paymentProvider: 'mock', url: 'http://localhost:4200/mock-payment?id=new-donation&session=hamonym-mock:fixture',
      }));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      (component as any).createDonationAndAdvance();
      expect(create).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/mock-payment'], jasmine.objectContaining({ queryParams: jasmine.objectContaining({ id: 'new-donation', session: 'hamonym-mock:fixture' }) }));
      expect(component.lowProfileId).toBeNull();
      expect(component.creatingDonation).toBeFalse();
    });
  }
});
