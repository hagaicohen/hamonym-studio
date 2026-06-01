import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignGoalsStepComponent } from './campaign-goals-step.component';

describe('CampaignGoalsStepComponent', () => {
  let component: CampaignGoalsStepComponent;
  let fixture: ComponentFixture<CampaignGoalsStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignGoalsStepComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignGoalsStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
