import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignDonationsStepComponent } from './campaign-donations-step.component';

describe('CampaignDonationsStepComponent', () => {
  let component: CampaignDonationsStepComponent;
  let fixture: ComponentFixture<CampaignDonationsStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignDonationsStepComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignDonationsStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
