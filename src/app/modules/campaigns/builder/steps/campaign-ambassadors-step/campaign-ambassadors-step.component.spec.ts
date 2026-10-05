import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CampaignAmbassadorsStepComponent } from './campaign-ambassadors-step.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { AmbassadorService } from '../../../services/ambassador.service';

// Hebrew-preserving default slug + goal-above-campaign-goal warning
// (2026-10-01). This Builder-draft step keeps its own lighter-touch,
// in-memory slug uniqueness check (deliberately left as-is -- see the
// final report) but shares the same normalization rule and warning copy
// as the other three ambassador flows.
describe('CampaignAmbassadorsStepComponent', () => {
  function create() {
    TestBed.configureTestingModule({
      imports: [CampaignAmbassadorsStepComponent],
      providers: [
        { provide: Router, useValue: { navigate: () => {} } },
        { provide: AmbassadorService, useValue: { downloadTemplate: () => {} } },
      ],
    });
    const fixture = TestBed.createComponent(CampaignAmbassadorsStepComponent);
    const component = fixture.componentInstance;
    const state = TestBed.inject(CampaignStudioStateService);
    state.patch({ targetAmount: 10000 });
    fixture.detectChanges();
    return component;
  }

  it('suggests a Hebrew-preserving default slug instead of a transliterated one', () => {
    const component = create();
    component.openAdd();
    component.form.fullName = 'חגי כהן';
    component.onFullNameInput();

    expect(component.form.slug).toBe('חגי-כהן');
  });

  it('shows the goal warning only once the entered goal exceeds the campaign target', () => {
    const component = create();
    component.openAdd();

    component.form.goalAmount = 5000;
    expect(component.goalAboveCampaignGoal()).toBeFalse();

    component.form.goalAmount = 15000;
    expect(component.goalAboveCampaignGoal()).toBeTrue();

    component.form.goalAmount = 10000;
    expect(component.goalAboveCampaignGoal()).toBeFalse();
  });

  it('never blocks save on the goal warning alone', () => {
    const component = create();
    component.openAdd();
    component.form.fullName = 'דנה לוי';
    component.form.slug = 'dana-levi';
    component.form.goalAmount = 999999;
    (component as any).slugStatus = 'valid';

    expect(component.goalAboveCampaignGoal()).toBeTrue();
    expect(component.canSave).toBeTrue();
  });
});
