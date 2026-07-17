import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CampaignApiService } from './campaign-api.service';
import { CampaignStudioStateService, Offering, RegistrationOption } from './campaign-studio-state.service';
import { environment } from '../../../../environments/environment';

// Offering is a pure gift/perk concept again; Registration Options are a
// separate, first-class concept backed by their own table server-side
// (registration_options), not the opaque "rewards" JSON blob.
// See DECISIONS.md (2026-07-16).
describe('CampaignApiService — Offering / Registration Options round trip', () => {
  let api: CampaignApiService;
  let state: CampaignStudioStateService;
  let httpMock: HttpTestingController;
  const apiUrl = `${environment.apiUrl}/api/campaigns`;

  const perk: Offering = {
    id: '1', title: 'תשורה', description: '',
    minimumAmount: 100, stock: null, imageUrl: null,
  };
  const option: RegistrationOption = {
    id: '2', key: 'RUN_5', title: '5 ק"מ', description: '', price: 50,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    api = TestBed.inject(CampaignApiService);
    state = TestBed.inject(CampaignStudioStateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('serializes offerings into "rewards" and registration options into "registration_options"', () => {
    const draft = { ...state.draft, offerings: [perk], registrationOptions: [option] };

    api.create('entity-1', draft).subscribe();

    const req = httpMock.expectOne(apiUrl);
    expect(req.request.body.rewards).toEqual([perk]);
    expect(req.request.body.registration_options).toEqual([option]);

    req.flush({ id: 'c1', rewards: [perk], registration_options: [option] });
  });

  it('deserializes offerings and registration options back from the response', () => {
    let result: any;

    api.create('entity-1', state.draft).subscribe(r => (result = r));

    const req = httpMock.expectOne(apiUrl);
    req.flush({ id: 'c1', rewards: [perk], registration_options: [option] });

    expect(result.offerings).toEqual([perk]);
    expect(result.registrationOptions).toEqual([option]);
  });

  it('coerces registration option price from a string (Postgres NUMERIC) to a number', () => {
    let result: any;

    api.getById('c1').subscribe(r => (result = r));

    const req = httpMock.expectOne(`${apiUrl}/c1`);
    req.flush({ id: 'c1', rewards: [], registration_options: [{ ...option, price: '50.00' }] });

    expect(result.registrationOptions[0].price).toBe(50);
  });
});
