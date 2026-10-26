import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { DonationSuccessComponent } from './donation-success.component';
import { DonationService } from '../../services/donation.service';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { environment } from '../../../../../environments/environment';

describe('Hosted donation return – verified result only', () => {
  const row = { id: 'd1', amount: 4000, created_at: '2026-10-25T07:25:35Z', campaign_title: 'Test', campaign_id: 'c', receipt_id: null };
  let status: jasmine.Spy;
  let track: jasmine.Spy;
  beforeEach(() => {
    // Karma itself renders in an iframe. Exercise the standalone branch
    // explicitly rather than the intentional parent-window return bridge.
    spyOn(DonationSuccessComponent.prototype, 'ngOnInit').and.callFake(function (this: DonationSuccessComponent) {
      this.ref = 'd1'; this.slug = 'test'; (this as any).loadDonation();
    });
    status = jasmine.createSpy().and.returnValue(of({ status: 'paid', receipt_id: 'r1' }));
    track = jasmine.createSpy();
    TestBed.configureTestingModule({
      imports: [DonationSuccessComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'test' }), queryParamMap: convertToParamMap({ ref: 'd1', amount: '4000' }) } } },
        { provide: DonationService, useValue: { getStatus: status } },
        { provide: AnalyticsService, useValue: { init() {}, trackEvent: track } },
        { provide: AppLoaderService, useValue: { hide() {} } },
      ],
    });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  for (const state of ['paid', 'failed', 'pending']) {
    it(`renders ${state} based on the backend, not the success URL`, () => {
      const fixture = TestBed.createComponent(DonationSuccessComponent); fixture.detectChanges();
      TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/api/donations/public/d1`).flush({ ...row, status: state });
      fixture.detectChanges();
      const text = () => (fixture.nativeElement as HTMLElement).textContent!;
      if (state === 'paid') { expect(text()).toContain('תודה רבה'); expect(track).toHaveBeenCalledTimes(1); }
      else { expect(text()).not.toContain('התקבלה בהצלחה'); expect(track).not.toHaveBeenCalled(); }
      if (state === 'failed') expect(text()).toContain('התשלום לא הושלם');
      if (state === 'pending') {
        expect(text()).toContain('אין לבצע תשלום נוסף');
        (fixture.componentInstance as any).pollQuietStatus(); fixture.detectChanges();
        expect(text()).toContain('התקבלה בהצלחה'); expect(track).toHaveBeenCalledTimes(1);
      }
      fixture.destroy();
    });
  }
  it('an unavailable API shows waiting and permits a safe GET-only recheck', () => {
    const fixture = TestBed.createComponent(DonationSuccessComponent); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${environment.apiUrl}/api/donations/public/d1`).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('אין לבצע תשלום נוסף');
    fixture.componentInstance.recheckPaymentStatus();
    const request = http.expectOne(`${environment.apiUrl}/api/donations/public/d1`); expect(request.request.method).toBe('GET');
    request.flush({ ...row, status: 'paid' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('התקבלה בהצלחה'); fixture.destroy();
  });
});
