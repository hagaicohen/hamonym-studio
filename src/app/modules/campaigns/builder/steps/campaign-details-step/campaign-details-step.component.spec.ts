import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignDetailsStepComponent } from './campaign-details-step.component';

describe('CampaignDetailsStepComponent', () => {
  let component: CampaignDetailsStepComponent;
  let fixture: ComponentFixture<CampaignDetailsStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignDetailsStepComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CampaignDetailsStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
