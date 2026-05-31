import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CampaignMediaStepComponent } from './campaign-media-step.component';

describe('CampaignMediaStepComponent', () => {
  let component: CampaignMediaStepComponent;
  let fixture: ComponentFixture<CampaignMediaStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampaignMediaStepComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CampaignMediaStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
