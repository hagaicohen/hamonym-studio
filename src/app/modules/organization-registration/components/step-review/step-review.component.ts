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

import { EntitiesService } from '../../../../core/services/entities.service';

import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component';

import { CurrentEntityService } from '../../../../core/services/current-entity.service';

import {
  forkJoin
} from 'rxjs';

@Component({
  selector: 'app-step-review',
  standalone: true,
  imports: [CommonModule, LoadingOverlayComponent],
  templateUrl: './step-review.component.html',
  styleUrls: ['./step-review.component.css'],
})
export class StepReviewComponent {

  private entitiesService =
    inject(EntitiesService);

  private router =
    inject(Router);

  private currentEntityService =
    inject(CurrentEntityService);

  @Output()
  back =
    new EventEmitter<void>();

  @Output()
  submit =
    new EventEmitter<void>();

  campaignTypes =
    CAMPAIGN_TYPES;

  private readonly stateService =
    inject(OrganizationRegistrationStateService);

  protected readonly state =
    computed(() => this.stateService.state());

  get entityConfig(): EntityConfig {

    return (
      ENTITY_CONFIGS[
        this.state().entityType as EntityType
      ] ||
      ENTITY_CONFIGS.association
    );
  }

  get certificateFileUrl(): string {

  return this.state()
    .certificateFileUrl;
}

get certificateFileName(): string {

  return this.state()
    .certificateFileName;
}
get section46FileUrl(): string {

  return this.state()
    .section46FileUrl;
}

  get section46FileName(): string {

  return this.state()
    .section46FileName;
}
  // =========================================================
  // HELPERS
  // =========================================================

  getCampaignTypeLabel(
    id: string
  ): string {

    return this.campaignTypes.find(
      (x) => x.id === id
    )?.title || id;
  }

  get maskedCardNumber(): string {

    const raw =
      this.state().cardNumber?.replace(/\s/g, '');

    if (!raw) {
      return '-';
    }

    return '**** **** **** ' + raw.slice(-4);
  }

  get paymentMethodLabel(): string {

    if (
      this.state().paymentMethod === 'masav'
    ) {

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

  get cardHolderName(): string {
    return this.state().cardHolderName;
  }

  get expiry(): string {
    return this.state().expiry;
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

    return !!this.state()
      .certificateFileUrl;
  }

  get section46Uploaded(): boolean {

    return !!this.state()
      .section46FileUrl;
  }

  get associationCertificateUrl(): string {

    return this.state()
      .certificateFileUrl;
  }

  get associationCertificateName(): string {

    return this.state()
      .certificateFileName;
  }

  get taxDocumentUrl(): string {

    return this.state()
      .section46FileUrl;
  }

  get taxDocumentName(): string {

    return this.state()
      .section46FileName;
  }

  // =========================================================
  // PROFILE COMPLETENESS
  // =========================================================

  get isProfileComplete(): boolean {

    return !!(

      this.state().entityType &&
      this.organizationName &&
      this.organizationNumber &&
      this.displayName &&
      this.email &&
      this.phone &&
      this.organizationDescription

    );
  }

  loading = false;

  success = false;

 submitApplication(): void {

  if (this.loading) {
    return;
  }

  this.loading = true;

  const payload = {

    entity_type:
      this.state().entityType,

    legal_name:
      this.organizationName,

    display_name:
      this.displayName,

    registration_number:
      this.organizationNumber,

    email:
      this.email,

    phone:
      this.phone,

    website:
      null,

    description:
      this.organizationDescription,

    logo_url:
      this.state().logoPreview,

    is_profile_complete:
      this.isProfileComplete,

    primary_category:
      this.state().primaryCategory,

    secondary_categories:
      this.state().selectedCategories,

    contact_full_name:
      this.fullName,

    contact_phone:
      this.phone,

    contact_email:
      this.email,

    association_certificate_url:
      this.certificateFileUrl,

    association_certificate_name:
      this.certificateFileName,

    tax_document_url:
      this.section46FileUrl,

    tax_document_name:
      this.section46FileName,

  };

  this.entitiesService
    .createEntity(payload)
    .subscribe({

      next: (res) => {

        const entityId =
        res.entity.id;

      const uploads = [];

      if (this.state().certificateFile) {

        uploads.push(

          this.entitiesService
            .uploadAssociationDocument(

              entityId,

              this.state().certificateFile!

            )

        );

      }

      if (this.state().section46File) {

        uploads.push(

          this.entitiesService
            .uploadTaxDocument(

              entityId,

              this.state().section46File!

            )

        );

      }

      if (this.state().logoFile) {

        uploads.push(

          this.entitiesService
            .uploadLogo(

              entityId,

              this.state().logoFile!

            )

        );

      }

      if (!uploads.length) {

        this.finishRegistration(
          res.entity
        );

        return;
      }

      console.log(uploads);

      forkJoin(uploads)
        .subscribe({

          next: (results: any[]) => {

            console.log(
              'UPLOAD RESULTS',
              results
            );

            const updatedEntity = {

              ...res.entity,

              logo_url:

                results.find(
                  r => r?.logo_url
                )?.logo_url

                || res.entity.logo_url,

              association_certificate_url:

                results.find(
                  r => r?.association_certificate_url
                )?.association_certificate_url

                || res.entity.association_certificate_url,

              tax_document_url:

                results.find(
                  r => r?.tax_document_url
                )?.tax_document_url

                || res.entity.tax_document_url

            };

            console.log(
              'UPDATED ENTITY',
              updatedEntity
            );

            this.finishRegistration(
              updatedEntity
            );

          },

          error: (err) => {

            console.error(
              'UPLOAD ERROR',
              err
            );

            this.loading = false;

          }

        });
      },

      error: (err) => {

        console.error(
          'CREATE ENTITY ERROR',
          err
        );

        this.loading = false;
      },
    });
 }



 private finishRegistration(
  entity: any
    ): void {

      localStorage.setItem(
        'currentEntity',
        JSON.stringify(entity)
      );

      this.currentEntityService
        .currentEntity
        .set(entity);

      this.currentEntityService
        .currentRole
        .set('owner');

      this.loading = false;

      this.success = true;

      console.log('FINISH');

      setTimeout(() => {

        this.router.navigate([
          '/campaigns'
        ]);

      }, 1800);
    }
}