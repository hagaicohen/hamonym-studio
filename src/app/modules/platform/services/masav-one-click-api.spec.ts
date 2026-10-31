import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FinanceOpsService } from './finance-ops.service';
import { environment } from '../../../../environments/environment';

describe('MASAV one-click HTTP contract', () => {
  let service: FinanceOpsService, http: HttpTestingController;
  const base = `${environment.apiUrl}/api/platform/finance-ops`;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FinanceOpsService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('loads the summary without invoking approval or export', () => {
    service.getMasavExportSummary().subscribe();
    const request = http.expectOne(`${base}/masav-export/summary`);
    expect(request.request.method).toBe('GET'); expect(request.request.headers.has('Authorization')).toBeTrue();
    request.flush({ summary: {} });
  });
  it('sends one authenticated atomic operation and receives file bytes', () => {
    const input = { requestId: 'request', expectedPreviewToken: 'token' };
    let file: Blob | undefined; service.approveAndDownloadMasav(input).subscribe(value => file = value);
    const request = http.expectOne(`${base}/masav-export/approve-and-download`);
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual(input);
    expect(request.request.responseType).toBe('blob'); expect(request.request.headers.has('Authorization')).toBeTrue();
    request.flush(new Blob(['xlsx'])); expect(file?.size).toBe(4);
  });
  it('terminates a stalled download without initiating a second request', fakeAsync(() => {
    let error: { name: string } | undefined;
    service.approveAndDownloadMasav({ requestId: 'same-request', expectedPreviewToken: 'same-token' }).subscribe({ error: value => error = value });
    const request = http.expectOne(`${base}/masav-export/approve-and-download`);
    tick(120001); expect(error?.name).toBe('TimeoutError'); expect(request.cancelled).toBeTrue();
    http.expectNone(`${base}/masav-export/approve-and-download`);
  }));
});
