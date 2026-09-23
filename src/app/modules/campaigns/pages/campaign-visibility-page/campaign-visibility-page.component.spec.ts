import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { CampaignVisibilityPageComponent } from './campaign-visibility-page.component';
import { environment } from '../../../../../environments/environment';
import { CampaignDraft } from '../../services/campaign-studio-state.service';

// Save-state indicator (2026-09-23) -- every autosaving control on this page
// used to give zero feedback (the is_hidden bug this same day was the
// sharpest example: a silently-dropped save looked identical to a
// successful one). Covers the saving -> saved / saving -> error+revert
// transitions for both save paths this page uses: the dedicated
// setVisibility() endpoint (toggleHidden) and the generic update() path
// every other toggle uses (persist()).
describe('CampaignVisibilityPageComponent save-state indicator', () => {
  let component: CampaignVisibilityPageComponent;
  let httpMock: HttpTestingController;

  const baseDraft = { id: 'zzz-test-campaign', isHidden: false, offeringsEnabled: true, blocks: [] } as unknown as CampaignDraft;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignVisibilityPageComponent, HttpClientTestingModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'zzz-test-campaign' } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(CampaignVisibilityPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    fixture.detectChanges(); // triggers ngOnInit -> initial getById fetch
    const initReq = httpMock.expectOne(`${environment.apiUrl}/api/campaigns/zzz-test-campaign`);
    initReq.flush(baseDraft);
  });

  afterEach(() => httpMock.verify());

  it('shows "saving" immediately, then "saved" once the dedicated visibility endpoint succeeds', () => {
    component.toggleHidden();
    expect(component.saving).toBe(true);
    expect(component.saved).toBe(false);
    expect(component.draft?.isHidden).toBe(true); // optimistic flip

    const req = httpMock.expectOne(`${environment.apiUrl}/api/campaigns/zzz-test-campaign/visibility`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ is_hidden: true });
    req.flush({});

    expect(component.saving).toBe(false);
    expect(component.saved).toBe(true);
    expect(component.saveError).toBeNull();
    expect(component.draft?.isHidden).toBe(true); // stays applied on success
  });

  it('on visibility save failure: shows a clear error AND reverts the optimistic toggle', () => {
    component.toggleHidden();
    const req = httpMock.expectOne(`${environment.apiUrl}/api/campaigns/zzz-test-campaign/visibility`);
    req.flush({ error: 'custom failure' }, { status: 500, statusText: 'Server Error' });

    expect(component.saving).toBe(false);
    expect(component.saved).toBe(false);
    expect(component.saveError).toBe('custom failure');
    expect(component.draft?.isHidden).toBe(false); // reverted, not left in the unsaved state
  });

  it('generic-update toggles (e.g. offerings) go through the same saving/saved cycle', () => {
    component.toggleOfferings();
    expect(component.saving).toBe(true);

    const req = httpMock.expectOne(`${environment.apiUrl}/api/campaigns/zzz-test-campaign`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ ...baseDraft, offeringsEnabled: false });

    expect(component.saving).toBe(false);
    expect(component.saved).toBe(true);
  });

  it('generic-update failure reverts the toggle and shows the fallback Hebrew error', () => {
    component.toggleOfferings();
    const req = httpMock.expectOne(`${environment.apiUrl}/api/campaigns/zzz-test-campaign`);
    req.flush({}, { status: 500, statusText: 'Server Error' });

    expect(component.saveError).toBe('השמירה נכשלה — נסה שוב');
    expect(component.draft?.offeringsEnabled).toBe(true); // reverted
  });
});
