import { TestBed } from '@angular/core/testing';
import { CampaignStepperComponent } from './campaign-stepper.component';

// Registration got its own fixed step (not a per-preset relabeling of the
// Offerings step) — see DECISIONS.md (2026-07-16).
describe('CampaignStepperComponent', () => {
  it('has 10 fixed steps, including "הרשמה" right after "תשורות"', () => {
    TestBed.configureTestingModule({ imports: [CampaignStepperComponent] });
    const component = TestBed.createComponent(CampaignStepperComponent).componentInstance;

    expect(component.steps.length).toBe(10);
    expect(component.steps[0]).toBe('פרטי בסיס');
    expect(component.steps[3]).toBe('תשורות');
    expect(component.steps[4]).toBe('הרשמה');
  });
});
