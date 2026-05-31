import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignFundraisingStepComponent } from './campaign-fundraising-step.component';

describe('CampaignFundraisingStepComponent', () => {
  let component: CampaignFundraisingStepComponent;
  let fixture: ComponentFixture<CampaignFundraisingStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignFundraisingStepComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CampaignFundraisingStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
