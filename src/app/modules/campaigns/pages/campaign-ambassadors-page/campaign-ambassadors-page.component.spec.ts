import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { CampaignAmbassadorsPageComponent } from './campaign-ambassadors-page.component';
import { AmbassadorService } from '../../services/ambassador.service';
import { CampaignApiService } from '../../services/campaign-api.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

// Personal-link + goal-above-campaign-goal warning (2026-10-01) -- the save
// gate and the warning are pure logic, so these tests exercise the
// component directly rather than driving its HTML template.
describe('CampaignAmbassadorsPageComponent', () => {
  function create(targetAmount: number) {
    TestBed.configureTestingModule({
      imports: [CampaignAmbassadorsPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'camp-1' }) } },
        },
        {
          provide: AmbassadorService,
          useValue: { list: () => of([]), computeStats: () => ({}) },
        },
        {
          provide: CampaignApiService,
          useValue: { getById: () => of({ title: 'Campaign', slug: 'camp-1', targetAmount, campaignLifecycle: 'fixed' }) },
        },
        { provide: AppLoaderService, useValue: { forceHide: () => {}, show: () => {}, hide: () => {} } },
      ],
    });
    const fixture = TestBed.createComponent(CampaignAmbassadorsPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return component;
  }

  it('shows the goal warning only once the entered goal exceeds the campaign target', () => {
    const component = create(10000);
    component.form.goalAmount = 5000;
    expect(component.goalAboveCampaignGoal()).toBeFalse();

    component.form.goalAmount = 15000;
    expect(component.goalAboveCampaignGoal()).toBeTrue();

    component.form.goalAmount = 10000;
    expect(component.goalAboveCampaignGoal()).toBeFalse();
  });

  it('gates save on fullName and slug availability, but never on the goal warning', () => {
    const component = create(10000);
    component.form.fullName = 'ישראל ישראלי';
    component.form.goalAmount = 999999;
    component.slugAvailable = false;
    expect(component.canSaveAmbassador).toBeFalse();

    component.slugAvailable = true;
    expect(component.canSaveAmbassador).toBeTrue();
  });

  it('openEdit pre-marks the existing slug as available (no forced re-check)', () => {
    const component = create(10000);
    component.openEdit({
      id: 'amb-1', campaignId: 'camp-1', fullName: 'דנה לוי', phone: null, email: null,
      goalAmount: null, status: 'active', personalMessage: '', personalTitle: '',
      slug: 'dana-levi', raisedOnline: 0, raisedManual: 0, raisedTotal: 0, donorCount: 0,
      createdAt: '', deactivatedAt: null,
    });
    expect(component.slugAvailable).toBeTrue();
    expect(component.form.slug).toBe('dana-levi');
  });

  it('openAdd resets slugAvailable so a brand-new ambassador cannot save before a check runs', () => {
    const component = create(10000);
    component.slugAvailable = true;
    component.openAdd();
    expect(component.slugAvailable).toBeFalse();
  });
});
