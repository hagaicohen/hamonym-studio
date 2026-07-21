// step-review.component.ts

import {
  Component,
  EventEmitter,
  Output,
  computed,
  inject,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';

import { CAMPAIGN_TYPES } from '../../constants/campaign-types';

import { Router } from '@angular/router';

import {
  ENTITY_CONFIGS,
  EntityConfig,
  EntityType,
} from '../../config/entity-config';

import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component';

import { CurrentEntityService } from '../../../../core/services/current-entity.service';

@Component({
  selector: 'app-step-review',
  standalone: true,
  imports: [CommonModule, LoadingOverlayComponent],
  templateUrl: './step-review.component.html',
  styleUrls: ['./step-review.component.css'],
})
export class StepReviewComponent {
  private router = inject(Router);

  private currentEntityService = inject(CurrentEntityService);

  @Output()
  back = new EventEmitter<void>();

  @Output()
  submit = new EventEmitter<void>();

  campaignTypes = CAMPAIGN_TYPES;

  private readonly stateService = inject(OrganizationRegistrationStateService);

  protected readonly state = this.stateService.state;

  get entityConfig(): EntityConfig {
    return (
      ENTITY_CONFIGS[this.state().entityType as EntityType] ||
      ENTITY_CONFIGS.association
    );
  }

  get certificateFileUrl(): string {
    return this.state().certificateFileUrl;
  }

  get certificateFileName(): string {
    return this.state().certificateFileName;
  }
  get section46FileUrl(): string {
    return this.state().section46FileUrl;
  }

  get section46FileName(): string {
    return this.state().section46FileName;
  }
  // =========================================================
  // HELPERS
  // =========================================================

  getCampaignTypeLabel(id: string): string {
    return this.campaignTypes.find((x) => x.id === id)?.title || id;
  }

  get paymentMethodLabel(): string {
    if (this.state().paymentMethod === 'masav') {
      return 'הוראת קבע / מס"ב';
    }

    return 'כרטיס אשראי';
  }

  // =========================================================
  // ORGANIZATION
  // =========================================================

  get organizationName(): string {
    return this.state().organizationName;
  }

  get organizationNumber(): string {
    return this.state().organizationNumber;
  }

  get fullName(): string {
    return this.state().fullName;
  }

  get email(): string {
    return this.state().email;
  }

  get phone(): string {
    return this.state().phone;
  }

  get selectedCategories(): string[] {
    return this.state().selectedCategories || [];
  }

  // =========================================================
  // PROFILE
  // =========================================================

  get displayName(): string {
    return this.state().displayName;
  }

  get organizationDescription(): string {
    return this.state().organizationDescription;
  }

  get selectedCampaignTypes(): string[] {
    return this.state().selectedCampaignTypes;
  }

  // =========================================================
  // GOALS
  // =========================================================

  get monthlyGoal(): string {
    return this.state().monthlyGoal;
  }

  get yearlyGoal(): string {
    return this.state().yearlyGoal;
  }

  // =========================================================
  // PAYMENT TERMINAL
  // =========================================================

  get provider(): string {
    return this.state().provider;
  }

  get terminalNumber(): string {
    return this.state().terminalNumber;
  }

  get apiUsername(): string {
    return this.state().apiUsername;
  }

  get connectionSuccess(): boolean {
    return this.state().connectionSuccess;
  }

  get connectionAttempted(): boolean {
    return this.state().connectionAttempted;
  }

  get useExistingTerminal(): boolean {
    return this.state().useExistingTerminal;
  }

  // =========================================================
  // BILLING
  // =========================================================

  get paymentMethod(): string {
    return this.state().paymentMethod;
  }

  get masavUploaded(): boolean {
    return this.state().masavUploaded;
  }

  get masavFileName(): string {
    return this.state().masavFileName;
  }

  get continueLater(): boolean {
    return this.state().continueLater;
  }

  // =========================================================
  // DOCUMENTS
  // =========================================================

  get registrationCertificateUploaded(): boolean {
    return !!this.state().certificateFileUrl;
  }

  get section46Uploaded(): boolean {
    return !!this.state().section46FileUrl;
  }

  get associationCertificateUrl(): string {
    return this.state().certificateFileUrl;
  }

  get associationCertificateName(): string {
    return this.state().certificateFileName;
  }

  get taxDocumentUrl(): string {
    return this.state().section46FileUrl;
  }

  get taxDocumentName(): string {
    return this.state().section46FileName;
  }

  // =========================================================
  // PROFILE COMPLETENESS
  // =========================================================

  get isProfileComplete(): boolean {
    return this.stateService.isProfileComplete;
  }

  loading = false;

  success = false;

  submitError = '';

  submitApplication(): void {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.submitError = '';

    this.stateService.save({ includeBilling: true }).subscribe({
      next: (entity) => this.finishRegistration(entity),
      error: (err) => {
        console.error('SUBMIT APPLICATION ERROR', err);
        this.loading = false;
        this.submitError = err?.error?.error || 'שגיאה בשליחת הבקשה. נסו שוב.';
      },
    });
  }

  private finishRegistration(entity: any): void {
    localStorage.setItem('currentEntity', JSON.stringify(entity));

    this.currentEntityService.currentEntity.set(entity);

    this.currentEntityService.currentRole.set('owner');

    this.loading = false;

    this.success = true;

    console.log('FINISH');

    setTimeout(() => {
      this.router.navigate(['/campaigns']);
    }, 1800);
  }
}
