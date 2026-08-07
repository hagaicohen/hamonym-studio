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
const REGISTRATION_STEP = 5;
const PAGE_BUILDER_STEP = 9;

// Every content-management step now has a real, working equivalent in the
// Campaign Workspace (Settings/Donation/Rewards/Registration/Sponsors/
// Ambassadors pages + the Overview's embedded Updates panel) — see
// docs/CAMPAIGN_MANAGEMENT_DASHBOARD_SPEC.md "Publish shifts the system's
// center of gravity". Once a campaign is published, editing here would
// silently diverge from what the Workspace (and campaign managers) see, so
// these are greyed out — Type/Lifecycle (2) has no Workspace equivalent
// yet and stays open; Page Builder (9) and Publish (10) are Builder-only
// by design, not migration candidates.
const PUBLISHED_GATED_STEPS = [1, 3, 4, 5, 6, 7, 8];

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
      this.currentStep = this.disabledSteps.includes(this.initialStep)
        ? this.nearestEnabledStep(this.initialStep, 1)
        : this.initialStep;
    } else if (this.isPublished) {
      // Step 1 (now disabled for published campaigns) is a bad landing
      // spot — go straight to Page Builder, the thing the Builder is for
      // once live.
      this.currentStep = PAGE_BUILDER_STEP;
    }
  }

  get isEditMode(): boolean {
    return this.state.isEditMode;
  }

  // Registration ("הרשמה") only makes sense for a bounded campaign with an
  // event to register for — an ongoing campaign has no such event, so the
  // step is skipped entirely rather than shown-but-empty. Kept inside the
  // fixed 1-10 numbering (see campaign-stepper's disabledSteps) instead of
  // renumbering the whole wizard.
  get isOngoing(): boolean {
    return this.state.draft.campaignLifecycle === 'ongoing';
  }

  // 'draft' is pre-publish; 'published'/'paused'/'ended' all mean the
  // campaign went live at some point, so the Workspace is already the real
  // source of truth for its content.
  get isPublished(): boolean {
    return this.state.draft.status !== 'draft';
  }

  get disabledSteps(): number[] {
    const gated = new Set<number>();
    if (this.isOngoing) gated.add(REGISTRATION_STEP);
    if (this.isPublished) PUBLISHED_GATED_STEPS.forEach(s => gated.add(s));
    return [...gated];
  }

  private nearestEnabledStep(from: number, direction: 1 | -1): number {
    let step = from;
    while (step >= 1 && step <= TOTAL_STEPS && this.disabledSteps.includes(step)) {
      step += direction;
    }
    return Math.min(TOTAL_STEPS, Math.max(1, step));
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
    if (target < 1 || target > TOTAL_STEPS) return;
    if (this.disabledSteps.includes(target)) {
      target = this.nearestEnabledStep(target, target >= this.currentStep ? 1 : -1);
    }
    if (target === this.currentStep) return;
    this.currentStep = target;
    // Wait a tick for the new step's content to render before scrolling —
    // otherwise the container's scrollHeight is still the previous step's.
    requestAnimationFrame(() => {
      this.contentEl?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
