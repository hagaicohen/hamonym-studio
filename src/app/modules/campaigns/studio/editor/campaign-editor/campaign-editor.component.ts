import { Component, inject, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignStepperComponent } from '../../../shared/components/campaign-stepper/campaign-stepper.component';
import { CampaignEditorFooterComponent } from '../../../shared/components/footer/campaign-editor-footer/campaign-editor-footer.component';
import { CampaignBasicStepComponent } from '../../../builder/steps/campaign-basic-step/campaign-basic-step.component';
import { CampaignTypeStepComponent } from '../../../builder/steps/campaign-type-step/campaign-type-step.component';
import { CampaignDonationStepComponent } from '../../../builder/steps/campaign-donation-step/campaign-donation-step.component';
import { CampaignOfferingsStepComponent } from '../../../builder/steps/campaign-offerings-step/campaign-offerings-step.component';
import { CampaignRegistrationStepComponent } from '../../../builder/steps/campaign-registration-step/campaign-registration-step.component';
import { CampaignSponsorsStepComponent } from '../../../builder/steps/campaign-sponsors-step/campaign-sponsors-step.component';
import { CampaignAmbassadorsStepComponent } from '../../../builder/steps/campaign-ambassadors-step/campaign-ambassadors-step.component';
import { CampaignUpdatesStepComponent } from '../../../builder/steps/campaign-updates-step/campaign-updates-step.component';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { CampaignPublishStepComponent } from '../../../builder/steps/campaign-publish-step/campaign-publish-step.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
const TOTAL_STEPS = 10;

@Component({
  selector: 'app-campaign-editor',
  standalone: true,
  imports: [
    CommonModule,
    CampaignStepperComponent,
    CampaignEditorFooterComponent,
    CampaignBasicStepComponent,
    CampaignTypeStepComponent,
    CampaignDonationStepComponent,
    CampaignOfferingsStepComponent,
    CampaignRegistrationStepComponent,
    CampaignSponsorsStepComponent,
    CampaignAmbassadorsStepComponent,
    CampaignUpdatesStepComponent,
    CampaignPageBuilderStepComponent,
    CampaignPublishStepComponent,
  ],
  templateUrl: './campaign-editor.component.html',
  styleUrls: ['./campaign-editor.component.css'],
})
export class CampaignEditorComponent implements OnInit {
  state = inject(CampaignStudioStateService);

  @ViewChild(CampaignBasicStepComponent)
  basicStep?: CampaignBasicStepComponent;

  @ViewChild('contentEl')
  private contentEl?: ElementRef<HTMLElement>;

  readonly TOTAL_STEPS = TOTAL_STEPS;

  // Set when returning from a "create a partner mid-campaign" side-trip to
  // /partners (see partner-link-modal's 'create' tab / §14) — lands the
  // manager back on the step they left, instead of step 1. Purely a UX
  // convenience; campaign-studio-page.component.ts reads the ?returnStep=
  // query param and passes it here.
  @Input() initialStep?: number;

  currentStep = 1;

  ngOnInit(): void {
    if (this.initialStep && this.initialStep >= 1 && this.initialStep <= TOTAL_STEPS) {
      this.currentStep = this.initialStep;
    }
  }

  get isEditMode(): boolean {
    return this.state.isEditMode;
  }

  nextStep(): void {
    this.navigateToStep(this.currentStep + 1);
  }

  previousStep(): void {
    this.navigateToStep(this.currentStep - 1);
  }

  // Called both by the footer's prev/next buttons and by clicking a step
  // number directly on the stepper. Purely local — CampaignStudioStateService
  // already holds the whole draft in memory regardless of persistence, so
  // moving between steps (in any direction, including jumping straight to
  // step 5) never needs the server at all. The campaign is only ever written
  // to the DB by an explicit user action: the topbar's "שמור טיוטה" button
  // (campaign-studio-topbar.component.ts#saveDraft) or reaching Publish
  // (campaign-publish-step.component.ts#publishCampaign) — never as a side
  // effect of navigating the builder. See DECISIONS.md.
  goToStep(step: number): void {
    this.navigateToStep(step);
  }

  private navigateToStep(target: number): void {
    if (target < 1 || target > TOTAL_STEPS || target === this.currentStep) return;
    this.currentStep = target;
    // Wait a tick for the new step's content to render before scrolling —
    // otherwise the container's scrollHeight is still the previous step's.
    requestAnimationFrame(() => {
      this.contentEl?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
