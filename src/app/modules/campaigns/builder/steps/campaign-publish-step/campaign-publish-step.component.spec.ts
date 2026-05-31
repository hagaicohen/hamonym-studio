import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignPublishStepComponent } from './campaign-publish-step.component';

describe('CampaignPublishStepComponent', () => {
  let component: CampaignPublishStepComponent;
  let fixture: ComponentFixture<CampaignPublishStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignPublishStepComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CampaignPublishStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
