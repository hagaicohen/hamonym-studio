import { Component, OnInit, inject } from '@angular/core';

import { finalize } from 'rxjs';

import { CommonModule } from '@angular/common';

import { CurrentEntityService } from '../../../../core/services/current-entity.service';

import { CAMPAIGN_TYPES } from '../../../organization-registration/constants/campaign-types';

import { ENTITY_CONFIGS } from '../../../organization-registration/config/entity-config';

import { environment } from '../../../../../environments/environment';

import { EntityBasicInfoSectionViewComponent } from '../view/entity-basic-info-section-view/entity-basic-info-section-view.component';

import { EntityBasicInfoSectionEditComponent } from '../edit/entity-basic-info-section-edit/entity-basic-info-section-edit.component';

import { EntityProfileSectionViewComponent } from '../view/entity-profile-section-view/entity-profile-section-view.component';

import { EntityProfileSectionEditComponent } from '../edit/entity-profile-section-edit/entity-profile-section-edit.component';

import { EntityGoalsSectionViewComponent } from '../view/entity-goals-section-view/entity-goals-section-view.component';

import { EntityGoalsSectionEditComponent } from '../edit/entity-goals-section-edit/entity-goals-section-edit.component';
import { EntityPaymentSectionViewComponent } from '../view/entity-payment-section-view/entity-payment-section-view.component';
import { EntityPaymentSectionEditComponent } from '../edit/entity-payment-section-edit/entity-payment-section-edit.component';
import { EntityBillingSectionViewComponent } from '../view/entity-billing-section-view/entity-billing-section-view.component';
import { EntityBillingSectionEditComponent } from '../edit/entity-billing-section-edit/entity-billing-section-edit.component';

import { EntitiesService } from '../../../../core/services/entities.service';

import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-entity-settings',
  standalone: true,
  imports: [
    CommonModule,
    EntityBasicInfoSectionViewComponent,
    EntityBasicInfoSectionEditComponent,
    EntityProfileSectionViewComponent,
    EntityProfileSectionEditComponent,
    EntityGoalsSectionViewComponent,
    EntityGoalsSectionEditComponent,
    EntityPaymentSectionViewComponent,
    EntityPaymentSectionEditComponent,
    EntityBillingSectionViewComponent,
    EntityBillingSectionEditComponent,
    LoadingOverlayComponent,
  ],
  templateUrl: './entity-settings.component.html',

  styleUrls: ['./entity-settings.component.css'],
})
export class EntitySettingsComponent implements OnInit {
  private currentEntityService = inject(CurrentEntityService);

  private entitiesService = inject(EntitiesService);

  editMode = false;

  isSaving = false;

  saveSuccess = false;

  saveError = false;

  entity: any = null;

  draftEntity: any = null;

  campaignTypes = CAMPAIGN_TYPES;

  ENTITY_CONFIGS = ENTITY_CONFIGS;

  apiUrl = environment.apiUrl;

  ngOnInit(): void {
    this.entity = this.currentEntityService.currentEntity();

    this.draftEntity = structuredClone(this.entity);
  }

  onEntityChange(partial: any): void {
    this.draftEntity = {
      ...this.draftEntity,

      ...partial,
    };
  }

  startEdit(): void {
    this.draftEntity = structuredClone(this.entity);

    this.editMode = true;
  }

  cancelEdit(): void {
    this.draftEntity = structuredClone(this.entity);

    this.editMode = false;
  }

saveAll(): void {

  if (
    !this.draftEntity?.id ||
    this.isSaving
  ) {
    return;
  }

  this.isSaving = true;

  const optimisticEntity = structuredClone(

    this.draftEntity

  );

  // optimistic UI

  this.entity = optimisticEntity;

  this.currentEntityService.setEntity(

    optimisticEntity

  );

  if (this.draftEntity?.billing_card_number) {

    this.draftEntity.billing_card_last4 =

      this.draftEntity
        .billing_card_number
        .replace(/\s/g, '')
        .slice(-4);

  }

  // =====================================================
  // CLEAN PAYLOAD
  // =====================================================

  const payload = {

    ...this.draftEntity,

    logo_data: undefined,

    association_certificate_data: undefined,

    tax_document_data: undefined

  };

  this.entitiesService
    .updateEntity(

      this.draftEntity.id,

      payload,

    )
    .pipe(

      finalize(() => {

        this.isSaving = false;

      }),

    )
    .subscribe({

      next: (updatedEntity) => {

        this.entity = structuredClone(

          updatedEntity

        );

        this.draftEntity = structuredClone(

          updatedEntity

        );

        this.currentEntityService.setEntity(

          updatedEntity

        );

        this.editMode = false;

        this.saveSuccess = true;

        setTimeout(() => {

          this.saveSuccess = false;

        }, 1600);

      },

      error: (err) => {

        console.error(err);

        this.saveError = true;

        setTimeout(() => {

          this.saveError = false;

        }, 2200);

      },

    });

}
  get entityTypeLabel(): string {
    const entityType = this.draftEntity
      ?.entity_type as keyof typeof ENTITY_CONFIGS;

    return this.ENTITY_CONFIGS[entityType]?.labels?.entity || 'יישות';
  }

  isCheckingBillingConnection = false;

  // =========================
  // BILLING CONNECTION TEST
  // =========================

  testBillingConnection(): void {
    this.isCheckingBillingConnection = true;

    setTimeout(() => {
      this.isCheckingBillingConnection = false;

      this.draftEntity = {
        ...this.draftEntity,

        cardcom_connection_status: 'success',

        cardcom_last_verified_at: new Date(),

        cardcom_last_error: null,
      };
    }, 1200);
  }
}
