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

import { CurrentContextService } from '../../../../core/services/current-context.service';

import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { sanitizeRichHtml } from '../../../../shared/utils/sanitize-rich-html';

@Component({
  selector: 'app-step-review',
  standalone: true,
  imports: [CommonModule, LoadingOverlayComponent],
  templateUrl: './step-review.component.html',
  styleUrls: ['./step-review.component.css'],
})
export class StepReviewComponent {
  private router = inject(Router);

  private sanitizer = inject(DomSanitizer);

  private currentEntityService = inject(CurrentEntityService);

  private currentContextService = inject(CurrentContextService);

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

  // The description is rich-text HTML from the step-profile editor -- was
  // rendered via plain {{ }} interpolation on the review summary, which
  // shows raw <p> tags as literal text instead of the actual description.
  // 2026-09-10, Launch Closure live-walkthrough.
  get organizationDescriptionHtml(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeRichHtml(this.state().organizationDescription));
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

    this.currentEntityService.setRole('owner');

    // Same bootstrap login.component.ts runs after a normal login --
    // without it, the sidebar/topbar/dashboard (all driven by
    // CurrentContextService.active()) have no context to show, and a
    // freshly-registered owner lands on an empty shell until they log out
    // and back in.
    this.currentContextService.initFromLogin({ entities: [entity] });

    this.loading = false;

    this.success = true;

    setTimeout(() => {
      this.router.navigate(['/campaigns']);
    }, 1800);
  }
}
