import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignContentStepComponent } from './campaign-content-step.component';

describe('CampaignContentStepComponent', () => {
  let component: CampaignContentStepComponent;
  let fixture: ComponentFixture<CampaignContentStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignContentStepComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignContentStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
