import { Component, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CampaignStepperComponent } from '../../../shared/components/campaign-stepper/campaign-stepper.component';
import { CampaignEditorFooterComponent } from '../../../shared/components/footer/campaign-editor-footer/campaign-editor-footer.component';
import { CampaignBasicStepComponent } from '../../../builder/steps/campaign-basic-step/campaign-basic-step.component';
import { CampaignTypeStepComponent } from '../../../builder/steps/campaign-type-step/campaign-type-step.component';
import { CampaignDonationStepComponent } from '../../../builder/steps/campaign-donation-step/campaign-donation-step.component';
import { CampaignRewardsStepComponent } from '../../../builder/steps/campaign-rewards-step/campaign-rewards-step.component';
import { CampaignSponsorsStepComponent } from '../../../builder/steps/campaign-sponsors-step/campaign-sponsors-step.component';
import { CampaignAmbassadorsStepComponent } from '../../../builder/steps/campaign-ambassadors-step/campaign-ambassadors-step.component';
import { CampaignUpdatesStepComponent } from '../../../builder/steps/campaign-updates-step/campaign-updates-step.component';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { CampaignPublishStepComponent } from '../../../builder/steps/campaign-publish-step/campaign-publish-step.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';

const TOTAL_STEPS = 9;

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
  state          = inject(CampaignStudioStateService);
  private api    = inject(CampaignApiService);
  private entity = inject(CurrentEntityService);
  private router = inject(Router);

  @ViewChild(CampaignBasicStepComponent)
  basicStep?: CampaignBasicStepComponent;

  currentStep  = 1;
  isSaving     = false;

  get isEditMode(): boolean {
    return this.state.isEditMode;
  }

  nextStep(): void {
    if (!this.canContinue() || this.isSaving) return;

    const draft    = this.state.draft;
    const entityId = this.entity.currentEntity()?.id;

    if (!entityId) { this.advance(); return; }

    this.isSaving  = true;
    const save$    = draft.id
      ? this.api.update(draft.id, draft)
      : this.api.create(entityId, draft);

    save$.subscribe({
      next: (res) => {
        if (!draft.id && res?.id) {
          this.state.patch({ id: res.id });
          this.router.navigate(['/campaigns', res.id, 'edit'], { replaceUrl: true });
        }
        this.isSaving = false;
        this.advance();
      },
      error: () => {
        this.isSaving = false;
        this.advance();
      },
    });
  }

  private advance(): void {
    if (this.currentStep < TOTAL_STEPS) this.currentStep++;
  }

  previousStep(): void {
    if (this.currentStep > 1) this.currentStep--;
  }

  goToStep(step: number): void {
    if (step >= 1 && step <= TOTAL_STEPS) {
      this.currentStep = step;
    }
  }

  canContinue(): boolean { return true; }
}
