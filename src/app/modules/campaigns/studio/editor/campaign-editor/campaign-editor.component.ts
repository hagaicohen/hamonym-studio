import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignStepperComponent } from '../../../shared/components/campaign-stepper/campaign-stepper.component';
import { CampaignEditorFooterComponent } from '../../../shared/components/footer/campaign-editor-footer/campaign-editor-footer.component';
import { CampaignTypeStepComponent } from '../../../builder/steps/campaign-type-step/campaign-type-step.component';
import { CampaignPublishStepComponent } from '../../../builder/steps/campaign-publish-step/campaign-publish-step.component';

import { ViewChild } from '@angular/core';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignContentStepComponent } from '../../../builder/steps/campaign-content-step/campaign-content-step.component';
import { CampaignGoalsStepComponent } from '../../../builder/steps/campaign-goals-step/campaign-goals-step.component';
import { CampaignBasicStepComponent } from '../../../builder/steps/campaign-basic-step/campaign-basic-step.component';
import { CampaignDonationsStepComponent } from '../../../builder/steps/campaign-donations-step/campaign-donations-step.component';
import { CampaignDefenitionsStepComponent } from "../../../builder/steps/campaign-defenitions-step/campaign-defenitions-step.component";
import { CampaignRewardsStepComponent } from '../../../builder/steps/campaign-rewards-step/campaign-rewards-step.component';

@Component({
  selector: 'app-campaign-editor',
  standalone: true,
  imports: [
    CommonModule,
    CampaignStepperComponent,
    CampaignEditorFooterComponent,
    CampaignTypeStepComponent,
    CampaignPublishStepComponent,
    CampaignBasicStepComponent,
    CampaignGoalsStepComponent,
    CampaignContentStepComponent,
    CampaignDonationsStepComponent,
    CampaignDefenitionsStepComponent,
    CampaignRewardsStepComponent
],
  templateUrl: './campaign-editor.component.html',
  styleUrls: ['./campaign-editor.component.css'],
})
export class CampaignEditorComponent {
  constructor(public state: CampaignStudioStateService) {}

  @ViewChild(CampaignBasicStepComponent)
  basicStep?: CampaignBasicStepComponent;

  currentStep = 1;

  nextStep(): void {
    if (!this.canContinue()) {
      return;
    }

    if (this.currentStep < 8) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  canContinue(): boolean {
    return true;
    switch (this.currentStep) {
      case 1:
        return this.basicStep?.isValid() ?? false;

      default:
        return true;
    }
  }
}
