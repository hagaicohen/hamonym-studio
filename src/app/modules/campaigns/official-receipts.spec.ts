import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { OfficialReceiptActionComponent } from './shared/components/official-receipt-action/official-receipt-action.component';
import { DonorRegistrationInviteComponent } from './shared/components/donor-registration-invite/donor-registration-invite.component';
import { ReceiptViewComponent } from './pages/receipt-view/receipt-view.component';
import { DonationService } from './services/donation.service';
import { MyDonationsComponent } from './pages/my-donations/my-donations.component';
import { RecurringService } from './services/recurring.service';
import { AuthService } from '../../core/services/auth.service';

describe('Official CardCom receipt UI and optional donor invitation', () => {
  afterEach(() => localStorage.removeItem('token'));

  it('stores refreshed donor authorization before notifying verification subscribers', () => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    localStorage.setItem('token', 'pre-verification-session');
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    let observed = false;
    auth.verifyDonationOwnership('email-proof').subscribe(() => {
      observed = true;
      expect(auth.getToken()).toBe('verified-session');
    });
    const request = http.expectOne(req => req.url.endsWith('/auth/me/verify-donations'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer pre-verification-session');
    request.flush({ verified: true, token: 'verified-session' });
    expect(observed).toBeTrue();
    http.verify();
  });

  it('invites a guest optionally with the email already entered in checkout', () => {
    localStorage.removeItem('token');
    TestBed.configureTestingModule({ imports: [DonorRegistrationInviteComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DonorRegistrationInviteComponent);
    fixture.componentInstance.email = 'fixture@example.invalid'; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('כל התרומות והקבלות שלך במקום אחד');
    expect(new URL(fixture.nativeElement.querySelector('a').getAttribute('href'), window.location.origin).searchParams.get('email')).toBe('fixture@example.invalid');
    fixture.nativeElement.querySelector('button').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('does not invite a logged-in donor to register again', () => {
    localStorage.setItem('token', 'fixture');
    TestBed.configureTestingModule({ imports: [DonorRegistrationInviteComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DonorRegistrationInviteComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('downloads the authenticated PDF once while a request is pending', () => {
    localStorage.setItem('token', 'fixture');
    TestBed.configureTestingModule({ imports: [OfficialReceiptActionComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    const service = TestBed.inject(DonationService);
    spyOn(service, 'getReceipt').and.returnValue(of({ id: 'r1', available: true, documents: [] }));
    const pending = new Subject<Blob>();
    const pdf = spyOn(service, 'getReceiptPdf').and.returnValue(pending);
    const blob = new Blob(['%PDF-official'], { type: 'application/pdf' });
    const createUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:official-receipt');
    spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    const fixture = TestBed.createComponent(OfficialReceiptActionComponent);
    fixture.componentRef.setInput('receiptId', 'r1');
    fixture.componentRef.setInput('iconMode', true); fixture.detectChanges();
    fixture.componentInstance.download(); fixture.componentInstance.download();
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.downloading).toBeTrue();
    pending.next(blob); pending.complete();
    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.downloading).toBeFalse();
  });

  for (const available of [true, false]) {
    it(`renders the receipt column icon with availability ${available}`, () => {
      localStorage.setItem('token', 'fixture');
      TestBed.configureTestingModule({ imports: [OfficialReceiptActionComponent, HttpClientTestingModule], providers: [provideRouter([])] });
      const service = TestBed.inject(DonationService);
      spyOn(service, 'getReceipt').and.returnValue(of({ id: 'r1', available, documents: [] }));
      const pdf = spyOn(service, 'getReceiptPdf').and.returnValue(throwError(() => ({ status: 503 })));
      const fixture = TestBed.createComponent(OfficialReceiptActionComponent);
      fixture.componentRef.setInput('receiptId', 'r1');
      fixture.componentRef.setInput('iconMode', true); fixture.detectChanges();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
      expect(button.disabled).toBe(!available);
      expect(button.querySelector('svg')).not.toBeNull();
      button.click(); fixture.detectChanges();
      if (available) {
        expect(pdf).toHaveBeenCalledOnceWith('r1');
        expect(fixture.componentInstance.downloadError).toBeTrue();
      } else {
        expect(pdf).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain('לא זמינה');
      }
    });

    it(`shows the official receipt action only when availability is ${available}`, () => {
      localStorage.setItem('token', 'fixture');
      TestBed.configureTestingModule({ imports: [OfficialReceiptActionComponent, HttpClientTestingModule], providers: [provideRouter([])] });
      spyOn(TestBed.inject(DonationService), 'getReceipt').and.returnValue(of({ id: 'r1', available, documents: [] }));
      const fixture = TestBed.createComponent(OfficialReceiptActionComponent);
      fixture.componentRef.setInput('receiptId', 'r1'); fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(available ? 'צפייה בקבלה' : 'הקבלה טרם זמינה');
      expect(fixture.nativeElement.textContent).not.toContain('אישור תרומה');
    });
  }

  it('never exposes a receipt action after a denied metadata request', () => {
    localStorage.setItem('token', 'fixture');
    TestBed.configureTestingModule({ imports: [OfficialReceiptActionComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    spyOn(TestBed.inject(DonationService), 'getReceipt').and.returnValue(throwError(() => ({ status: 404 })));
    const fixture = TestBed.createComponent(OfficialReceiptActionComponent);
    fixture.componentRef.setInput('receiptId', 'r1'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('הקבלה טרם זמינה');
    expect(fixture.nativeElement.textContent).not.toContain('צפייה בקבלה');
  });

  it('requests the PDF with authentication and never requests a public provider URL', () => {
    localStorage.setItem('token', 'fixture');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    TestBed.inject(DonationService).getReceiptPdf('r1').subscribe();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne(url => url.url.endsWith('/api/donations/receipt/r1/pdf'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer fixture');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-fixture'], { type: 'application/pdf' })); http.verify();
  });

  it('shows unavailable instead of generating an internal confirmation when a PDF is missing', () => {
    TestBed.configureTestingModule({ imports: [ReceiptViewComponent, HttpClientTestingModule], providers: [provideRouter([]), {
      provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'r1' } } },
    }] });
    spyOn(TestBed.inject(DonationService), 'getReceiptPdf').and.returnValue(throwError(() => ({ status: 404 })));
    const fixture = TestBed.createComponent(ReceiptViewComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('הקבלה טרם זמינה');
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('אישור תרומה');
  });

  it('renders and downloads only the PDF blob returned by the authenticated Backend', () => {
    TestBed.configureTestingModule({ imports: [ReceiptViewComponent, HttpClientTestingModule], providers: [provideRouter([]), {
      provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'r1' } } },
    }] });
    const blob = new Blob(['%PDF-official-fixture'], { type: 'application/pdf' });
    spyOn(TestBed.inject(DonationService), 'getReceiptPdf').and.returnValue(of(blob));
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:official-fixture');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const fixture = TestBed.createComponent(ReceiptViewComponent); fixture.detectChanges();
    expect(create).toHaveBeenCalledOnceWith(blob);
    expect(fixture.nativeElement.querySelector('iframe').getAttribute('src')).toBe('blob:official-fixture');
    expect(fixture.nativeElement.querySelector('a[download]').getAttribute('download')).toBe('cardcom-receipt.pdf');
    fixture.destroy(); expect(revoke).toHaveBeenCalledWith('blob:official-fixture');
  });

  it('filters, sorts and paginates donor history without altering paid totals', () => {
    TestBed.configureTestingModule({ imports: [MyDonationsComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MyDonationsComponent);
    const component = fixture.componentInstance;
    spyOn(component, 'ngOnInit');
    component.donations = Array.from({ length: 12 }, (_, i) => ({ id: String(i), amount: i + 1,
      status: i === 0 ? 'failed' : 'paid', campaign_title: i === 1 ? 'Special campaign' : 'Campaign',
      campaign_slug: 'campaign', entity_name: 'Organization', created_at: '2026-10-27', completed_at: '2026-10-27' } as any));
    const total = component.totalDonated;
    component.loading = false; component.recurringLoading = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.md-donations-table th').length).toBe(7);
    expect(fixture.nativeElement.querySelector('tbody .md-row-number').textContent.trim()).toBe('1');
    expect(fixture.nativeElement.querySelector('.md-verification')).toBeNull();
    expect(component.visibleDonations.length).toBe(10);
    expect(component.pageCount).toBe(2);
    component.page = 2; expect(component.visibleDonations.length).toBe(2);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody .md-row-number').textContent.trim()).toBe('11');
    component.search = 'special'; component.page = 1;
    expect(component.filteredDonations.map(d => d.id)).toEqual(['1']);
    component.search = ''; component.statusFilter = 'failed';
    expect(component.filteredDonations.map(d => d.id)).toEqual(['0']);
    component.statusFilter = ''; component.sortBy('amount');
    expect(component.visibleDonations[0].amount).toBe(12);
    component.sortBy('amount'); expect(component.visibleDonations[0].amount).toBe(1);
    component.search = 'no matching donation'; expect(component.filteredDonations.length).toBe(0);
    expect(component.totalDonated).toBe(total);
    expect(component.donations[0].id).toBe('0');
  });

  it('refreshes donation history immediately after ownership verification succeeds', () => {
    const auth = {
      getToken: () => 'fixture', currentUser: () => null,
      verifyDonationOwnership: jasmine.createSpy().and.returnValue(of({ verified: true })),
    };
    TestBed.configureTestingModule({ imports: [MyDonationsComponent, HttpClientTestingModule], providers: [provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ verification: 'fixture-token' }) } } },
    ] });
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const history = [{ id: 'd1', status: 'paid', amount: 100, campaign_slug: 'fixture' }] as any;
    const getHistory = spyOn(TestBed.inject(DonationService), 'getMyDonations').and.returnValue(of(history));
    spyOn(TestBed.inject(RecurringService), 'getMyRecurring').and.returnValue(of([]));
    const fixture = TestBed.createComponent(MyDonationsComponent);
    fixture.componentInstance.ngOnInit();
    expect(auth.verifyDonationOwnership).toHaveBeenCalledOnceWith('fixture-token');
    expect(getHistory).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.donations).toBe(history);
    expect(fixture.componentInstance.totalDonated).toBe(100);
    expect(fixture.componentInstance.fmtMoney(100.5)).toContain('100.5');
  });
});
