import { Component, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignStepperComponent } from '../../../shared/components/campaign-stepper/campaign-stepper.component';
import { CampaignEditorFooterComponent } from '../../../shared/components/footer/campaign-editor-footer/campaign-editor-footer.component';
import { CampaignBasicStepComponent } from '../../../builder/steps/campaign-basic-step/campaign-basic-step.component';
import { CampaignTypeStepComponent } from '../../../builder/steps/campaign-type-step/campaign-type-step.component';
import { CampaignRewardsStepComponent } from '../../../builder/steps/campaign-rewards-step/campaign-rewards-step.component';
import { CampaignSponsorsStepComponent } from '../../../builder/steps/campaign-sponsors-step/campaign-sponsors-step.component';
import { CampaignAmbassadorsStepComponent } from '../../../builder/steps/campaign-ambassadors-step/campaign-ambassadors-step.component';
import { CampaignUpdatesStepComponent } from '../../../builder/steps/campaign-updates-step/campaign-updates-step.component';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { CampaignPublishStepComponent } from '../../../builder/steps/campaign-publish-step/campaign-publish-step.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';

const TOTAL_STEPS = 8;

@Component({
  selector: 'app-campaign-editor',
  standalone: true,
  imports: [
    CommonModule,
    CampaignStepperComponent,
    CampaignEditorFooterComponent,
    CampaignBasicStepComponent,
    CampaignTypeStepComponent,
    CampaignRewardsStepComponent,
    CampaignSponsorsStepComponent,
    CampaignAmbassadorsStepComponent,
    CampaignUpdatesStepComponent,
    CampaignPageBuilderStepComponent,
    CampaignPublishStepComponent,
  ],
  templateUrl: './campaign-editor.component.html',
  styleUrls: ['./campaign-editor.component.css'],
})
export class CampaignEditorComponent {
  state = inject(CampaignStudioStateService);

  @ViewChild(CampaignBasicStepComponent)
  basicStep?: CampaignBasicStepComponent;

  currentStep = 1;

  nextStep(): void {
    if (!this.canContinue()) return;
    if (this.currentStep < TOTAL_STEPS) this.currentStep++;
  }

  previousStep(): void {
    if (this.currentStep > 1) this.currentStep--;
  }

  canContinue(): boolean { return true; }
}
