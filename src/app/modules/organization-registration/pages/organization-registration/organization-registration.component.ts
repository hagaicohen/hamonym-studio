import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { StepEntityComponent } from '../../components/step-entity/step-entity.component';
import { StepProfileComponent } from '../../components/step-profile/step-profile.component';
import { StepGoalsComponent } from '../../components/step-goals/step-goals.component';
import { StepPaymentComponent } from '../../components/step-payment/step-payment.component';
import { StepReviewComponent } from '../../components/step-review/step-review.component';
import { StepBillingMethodComponent } from '../../components/step-billing-method/step-billing-method.component';
import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';
import { EntitiesService } from '../../../../core/services/entities.service';

@Component({
  selector: 'app-organization-registration',
  standalone: true,
  imports: [
    CommonModule,
    StepEntityComponent,
    StepProfileComponent,
    StepGoalsComponent,
    StepPaymentComponent,
    StepReviewComponent,
    StepBillingMethodComponent,
  ],
  templateUrl: './organization-registration.component.html',
  styleUrls: ['./organization-registration.component.css'],
})
export class OrganizationRegistrationComponent implements OnInit {
  protected stateService = inject(OrganizationRegistrationStateService);
  private entitiesService = inject(EntitiesService);

  currentStep = 1;

  // A previously-saved draft found for this user — shown as a resume prompt
  // rather than silently loaded, so starting a genuinely new registration
  // (while an old abandoned draft still exists) stays possible.
  draftToResume = signal<any | null>(null);

  savingDraft = signal(false);
  draftSaved = signal(false);
  draftSaveError = signal('');

  ngOnInit(): void {
    // Only offer to resume if this wizard instance hasn't already picked up
    // an entity (e.g. a draft just saved a moment ago in this same visit).
    if (this.stateService.state().entityId) return;

    this.entitiesService.getMyEntities().subscribe({
      next: (res) => {
        const drafts = (res.entities || []).filter((e: any) => e.status === 'draft');
        if (!drafts.length) return;
        drafts.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        this.draftToResume.set(drafts[0]);
      },
    });
  }

  resumeDraft(): void {
    const draft = this.draftToResume();
    if (!draft) return;
    this.stateService.loadFromEntity(draft);
    this.draftToResume.set(null);
  }

  dismissDraftPrompt(): void {
    this.draftToResume.set(null);
  }

  saveDraft(): void {
    if (this.savingDraft()) return;
    this.savingDraft.set(true);
    this.draftSaveError.set('');

    this.stateService.save({ includeBilling: false }).subscribe({
      next: () => {
        this.savingDraft.set(false);
        this.draftSaved.set(true);
        setTimeout(() => this.draftSaved.set(false), 3000);
      },
      error: (err) => {
        this.savingDraft.set(false);
        this.draftSaveError.set(err?.error?.error || 'שמירת הטיוטה נכשלה. נסו שוב.');
      },
    });
  }

  nextStep(): void {
    this.currentStep++;
  }

  previousStep(): void {
    this.currentStep--;
  }
}
