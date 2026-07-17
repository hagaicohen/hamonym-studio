import { TestBed, fakeAsync, flush } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CampaignRegistrationStepComponent } from './campaign-registration-step.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';

// Registration Options — a race/event participant category or price tier,
// pulled out of the Offering/rewards model into its own step+concept.
// No enable toggle: "is registration on?" is registrationOptions.length > 0.
// See DECISIONS.md (2026-07-16).
describe('CampaignRegistrationStepComponent', () => {
  let component: CampaignRegistrationStepComponent;
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignRegistrationStepComponent, HttpClientTestingModule],
    });
    const fixture = TestBed.createComponent(CampaignRegistrationStepComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(CampaignStudioStateService);
  });

  it('starts with an empty option form and no registration options', () => {
    expect(component.option.title).toBe('');
    expect(component.isFormValid).toBe(false);
    expect(state.draft.registrationOptions.length).toBe(0);
  });

  it('requires both a title and a positive price to save', () => {
    component.option.title = '10 ק"מ';
    expect(component.isFormValid).toBe(false); // price still 0

    component.option.price = 180;
    expect(component.isFormValid).toBe(true);
  });

  it('saves an option into draft.registrationOptions', fakeAsync(() => {
    component.option.title = '10 ק"מ';
    component.option.price = 180;
    component.save();
    flush();

    expect(state.draft.registrationOptions.length).toBe(1);
    expect(state.draft.registrationOptions[0].title).toBe('10 ק"מ');
    expect(state.draft.registrationOptions[0].price).toBe(180);
  }));

  it('shows a spinner on the save button while the save is in flight', fakeAsync(() => {
    component.option.title = '10 ק"מ';
    component.option.price = 180;
    component.save();

    expect(component.isSaving).toBe(true);
    flush();
    expect(component.isSaving).toBe(false);
  }));

  it('editing an existing option preserves its fields unless explicitly changed', fakeAsync(() => {
    component.option.title = '10 ק"מ';
    component.option.price = 180;
    component.save();
    flush();
    const saved = state.draft.registrationOptions[0];

    component.editOption(saved);
    expect(component.option.title).toBe('10 ק"מ');

    component.option.description = 'מסלול עירוני';
    component.save();
    flush();

    expect(state.draft.registrationOptions.length).toBe(1);
    expect(state.draft.registrationOptions[0].description).toBe('מסלול עירוני');
  }));

  it('duplicating an option copies its fields', fakeAsync(() => {
    component.option.title = '10 ק"מ';
    component.option.price = 180;
    component.save();
    flush();
    const saved = state.draft.registrationOptions[0];

    component.duplicateOption(saved);
    flush();

    expect(state.draft.registrationOptions.length).toBe(2);
    expect(state.draft.registrationOptions[1].title).toBe('10 ק"מ');
  }));

  it('deleting an option removes it from draft.registrationOptions', fakeAsync(() => {
    component.option.title = '10 ק"מ';
    component.option.price = 180;
    component.save();
    flush();
    const saved = state.draft.registrationOptions[0];

    component.deleteOption(saved.id);

    expect(state.draft.registrationOptions.length).toBe(0);
  }));

  // Real-DOM regression test: the tests above set component.option.title
  // directly, bypassing the actual <input>/save-button DOM round trip — that
  // hid a real bug where the title field visually kept showing the
  // just-saved value after save() reset the form (button correctly
  // disabled, but the field looked "stuck" with old text, making it look
  // like a second option couldn't be added). See DECISIONS.md.
  it('clears the title field in the DOM (not just internal state) after saving, so a second option can be entered', fakeAsync(() => {
    const fixture = TestBed.createComponent(CampaignRegistrationStepComponent);
    fixture.detectChanges();

    const titleInput = fixture.nativeElement.querySelector('.rf-input') as HTMLInputElement;
    const priceInput = fixture.nativeElement.querySelector('.rf-input--currency') as HTMLInputElement;
    const saveBtn = fixture.nativeElement.querySelector('.rf-btn-save') as HTMLButtonElement;

    titleInput.value = 'מבוגר רגיל';
    titleInput.dispatchEvent(new Event('input'));
    priceInput.value = '50';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(saveBtn.disabled).toBe(false);

    saveBtn.click();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    expect(titleInput.value).toBe('');
    expect(saveBtn.disabled).toBe(true);

    titleInput.value = 'ילד';
    titleInput.dispatchEvent(new Event('input'));
    priceInput.value = '30';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(saveBtn.disabled).toBe(false);
    saveBtn.click();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const draftState = TestBed.inject(CampaignStudioStateService);
    expect(draftState.draft.registrationOptions.length).toBe(2);
  }));
});
