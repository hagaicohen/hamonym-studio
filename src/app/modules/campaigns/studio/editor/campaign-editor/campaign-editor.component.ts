import {
  Component
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  CampaignStepperComponent
} from '../../../shared/components/campaign-stepper/campaign-stepper.component';

import {
  CampaignEditorFooterComponent
} from '../../../shared/components/footer/campaign-editor-footer/campaign-editor-footer.component';

import {
  CampaignTypeStepComponent
} from '../../../builder/steps/campaign-type-step/campaign-type-step.component';

import {
  CampaignDetailsStepComponent
} from '../../../builder/steps/campaign-details-step/campaign-details-step.component';

import {
  CampaignMediaStepComponent
} from '../../../builder/steps/campaign-media-step/campaign-media-step.component';

import {
  CampaignFundraisingStepComponent
} from '../../../builder/steps/campaign-fundraising-step/campaign-fundraising-step.component';

import {
  CampaignPublishStepComponent
} from '../../../builder/steps/campaign-publish-step/campaign-publish-step.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-editor',
  standalone: true,
  imports: [

    CommonModule,
    CampaignStepperComponent,

    CampaignEditorFooterComponent,

    CampaignTypeStepComponent,

    CampaignDetailsStepComponent,

    CampaignMediaStepComponent,

    CampaignFundraisingStepComponent,

    CampaignPublishStepComponent

  ],
  templateUrl:
    './campaign-editor.component.html',
  styleUrls:
    ['./campaign-editor.component.css']
})
export class CampaignEditorComponent {

  constructor(public state: CampaignStudioStateService) {}


  currentStep = 1;

 nextStep(): void {

  if (
    !this.canContinue()
  ) {

    return;

  }

  if (
    this.currentStep < 5
  ) {

    this.currentStep++;

  }

}

  previousStep(): void {

    if (this.currentStep > 1) {

      this.currentStep--;

    }

  }

  canContinue(): boolean {

  switch (
    this.currentStep
  ) {

    case 1:

      return !!this.state
        .draft
        .type;

    default:

      return true;

  }

}

}