import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CampaignOfferingsStepComponent } from './campaign-offerings-step.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';

// Offering is a pure gift/perk concept again — registration categories were
// pulled out into their own model+step. See DECISIONS.md (2026-07-16).
describe('CampaignOfferingsStepComponent', () => {
  let component: CampaignOfferingsStepComponent;
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignOfferingsStepComponent, HttpClientTestingModule],
    });
    const fixture = TestBed.createComponent(CampaignOfferingsStepComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(CampaignStudioStateService);
  });

  it('starts with an empty offering form', () => {
    expect(component.offering.title).toBe('');
    expect(component.isFormValid).toBe(false);
  });

  it('saves an offering into draft.offerings', () => {
    component.offering.title = 'ספר חתום';
    component.save();

    expect(state.draft.offerings.length).toBe(1);
    expect(state.draft.offerings[0].title).toBe('ספר חתום');
  });

  it('editing an existing offering preserves its fields unless explicitly changed', () => {
    component.offering.title = 'ספר חתום';
    component.save();
    const saved = state.draft.offerings[0];

    component.editOffering(saved);
    expect(component.offering.title).toBe('ספר חתום');

    component.offering.description = 'עם הקדשה אישית';
    component.save();

    expect(state.draft.offerings.length).toBe(1);
    expect(state.draft.offerings[0].description).toBe('עם הקדשה אישית');
  });

  it('duplicating an offering copies its fields', () => {
    component.offering.title = 'ספר חתום';
    component.save();
    const saved = state.draft.offerings[0];

    component.duplicateOffering(saved);

    expect(state.draft.offerings.length).toBe(2);
    expect(state.draft.offerings[1].title).toBe('ספר חתום');
  });

  it('deleting an offering removes it from draft.offerings', () => {
    component.offering.title = 'ספר חתום';
    component.save();
    const saved = state.draft.offerings[0];

    component.deleteOffering(saved.id);

    expect(state.draft.offerings.length).toBe(0);
  });
});
