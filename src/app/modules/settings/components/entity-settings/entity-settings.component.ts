// entity-settings.component.ts

import {
  Component,
  OnInit,
  inject,
  ViewChild
} from '@angular/core';

import {
  finalize
} from 'rxjs';

import {
  CommonModule
} from '@angular/common';

import {
  CurrentEntityService
} from '../../../../core/services/current-entity.service';

import {
  CAMPAIGN_TYPES
} from '../../../organization-registration/constants/campaign-types';

import {
  ENTITY_CONFIGS
} from '../../../organization-registration/config/entity-config';

import {
  environment
} from '../../../../../environments/environment';

import {
  EntityBasicInfoSectionViewComponent
} from '../view/entity-basic-info-section-view/entity-basic-info-section-view.component';

import {
  EntityBasicInfoSectionEditComponent
} from '../edit/entity-basic-info-section-edit/entity-basic-info-section-edit.component';

import {
  EntityProfileSectionViewComponent
} from '../view/entity-profile-section-view/entity-profile-section-view.component';

import {
  EntityProfileSectionEditComponent
} from '../edit/entity-profile-section-edit/entity-profile-section-edit.component';

import {
  EntityGoalsSectionViewComponent
} from '../view/entity-goals-section-view/entity-goals-section-view.component';

import {
  EntityGoalsSectionEditComponent
} from '../edit/entity-goals-section-edit/entity-goals-section-edit.component';

import {
  EntityPaymentSectionViewComponent
} from '../view/entity-payment-section-view/entity-payment-section-view.component';

import {
  EntityPaymentSectionEditComponent
} from '../edit/entity-payment-section-edit/entity-payment-section-edit.component';

import {
  EntityBillingSectionViewComponent
} from '../view/entity-billing-section-view/entity-billing-section-view.component';

import {
  EntityBillingSectionEditComponent
} from '../edit/entity-billing-section-edit/entity-billing-section-edit.component';

import {
  EntitiesService
} from '../../../../core/services/entities.service';

import {
  LoadingOverlayComponent
} from '../../../../shared/components/loading-overlay/loading-overlay.component';

import {

  SectionSaveState

} from '../../models/section-save-state.model';

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

    LoadingOverlayComponent
  ],

  templateUrl:
    './entity-settings.component.html',

  styleUrls: [
    './entity-settings.component.css'
  ],
})
export class EntitySettingsComponent
  implements OnInit {

  constructor(
  ) {
  }

  private currentEntityService =
    inject(CurrentEntityService);

  private entitiesService =
    inject(EntitiesService);

  @ViewChild(EntityBillingSectionEditComponent)
  billingSection?:
    EntityBillingSectionEditComponent;

  editMode = false;

  editingSection:
    string | null = null;


  saveError = '';
  showInlineError = false;

  saveState: SectionSaveState = {

  isSaving: false,

  saveCompleted: false,

  saveFailed: false
};

  entity: any = null;

  draftEntity: any = null;

  campaignTypes =
    CAMPAIGN_TYPES;

  ENTITY_CONFIGS =
    ENTITY_CONFIGS;

  apiUrl =
    environment.apiUrl;

  ngOnInit(): void {

    this.entity =
      this.currentEntityService
        .currentEntity();

    this.draftEntity =
      structuredClone(
        this.entity
      );

  }

  onEntityChange(
    partial: any
  ): void {

    this.draftEntity = {

      ...this.draftEntity,

      ...partial,
    };

  }

  startEdit(
    section?: string
  ): void {

    this.saveError = '';

    this.draftEntity =
      structuredClone(
        this.entity
      );

    this.editMode =
      true;

    this.editingSection =
      section || null;

  }

  cancelEdit(): void {

    this.saveError = '';

    this.draftEntity =
      structuredClone(
        this.entity
      );

    this.editMode =
      false;

    this.editingSection =
      null;

  }

async saveAll(): Promise<void> {

  console.log(
    'SAVE ALL STARTED'
  );

  this.saveError = '';

  this.showInlineError =
    false;

  this.saveState.saveCompleted =
    false;

  if (
    !this.draftEntity?.id ||
    this.saveState.isSaving
  ) {
    return;
  }

  this.saveState.isSaving =
    true;

  const billingComponent =

    document.querySelector(
      'app-entity-billing-section-edit'
    );

  const isReplacingCard =

    billingComponent
      ?.querySelector(
        'app-openfields-form'
      );

  if (
    isReplacingCard &&
    this.billingSection
      ?.openfieldsForm
  ) {

    const tokenized =

      await this.billingSection
        .openfieldsForm
        .tokenize();

    if (!tokenized) {

      this.saveError =

        'שמירת כרטיס האשראי נכשלה';

      this.showInlineError =
        true;

      this.saveState.isSaving =
        false;

      setTimeout(() => {

        this.showInlineError =
          false;

      }, 2500);

      return;

    }

  }

  const optimisticEntity =
    structuredClone(

      this.draftEntity

    );

  /*
    IMPORTANT:
    preserve billing method UI state
  */

  if (
    this.editingSection === 'billing'
  ) {

    optimisticEntity.billing_method =

      this.draftEntity
        .billing_method;

    optimisticEntity
      .billing_masav_file_name =

      this.draftEntity
        .billing_masav_file_name;

  }

  this.entity =
    optimisticEntity;

  this.currentEntityService
    .setEntity(

      optimisticEntity

    );

  if (
    this.draftEntity
      ?.billing_card_number
  ) {

    this.draftEntity
      .billing_card_last4 =

      this.draftEntity
        .billing_card_number
        .replace(/\s/g, '')
        .slice(-4);

  }

const payload = {

  ...this.draftEntity,

  /*
    IMPORTANT:
    switching to MASAV
    must clear old credit card data
  */

  ...(this.draftEntity?.billing_method === 'masav'
    ? {

        billing_last4:
          null,

        exp_month:
          null,

        exp_year:
          null,

        billing_provider:
          null

      }
    : {}),

  logo_data:
    undefined,

  association_certificate_data:
    undefined,

  tax_document_data:
    undefined

};

  this.entitiesService
  .updateEntity(

    this.draftEntity.id,

    payload,

  )

  .subscribe({

    next: (updatedEntity) => {

      this.saveState.isSaving =
        false;

      this.saveState.saveFailed =
        false;

      this.saveState.saveCompleted =
        true;

      /*
        IMPORTANT:
        preserve billing UI state
        after backend response
      */

      const mergedEntity = {

        ...updatedEntity,

        billing_method:
          this.draftEntity
            ?.billing_method,

        billing_masav_file_name:
          this.draftEntity
            ?.billing_masav_file_name

      };

      this.entity =
        structuredClone(
          mergedEntity
        );

      this.draftEntity =
        structuredClone(
          mergedEntity
        );

      this.currentEntityService
        .setEntity(
          mergedEntity
        );

      setTimeout(() => {

        this.saveState.saveCompleted =
          false;

        this.editMode =
          false;

        this.editingSection =
          null;

      }, 1500);

      this.entitiesService
        .getEntityById(
          updatedEntity.id
        )

        .subscribe({

          next: (fullEntity: any) => {

            const entity =

              fullEntity.entity ||
              fullEntity;

            this.entity =
              structuredClone(entity);

            this.draftEntity =
              structuredClone(entity);

            this.currentEntityService
              .setEntity(entity);

          },

          error: (err) => {

            console.error(err);

          }

        });

    },

    error: (err) => {

      console.error(err);

      this.saveState.isSaving =
        false;

      this.saveState.saveCompleted =
        false;

      this.saveState.saveFailed =
        true;


      /*
          IMPORTANT:
          keep billing edit mode open
          after failed save
        */

        if (
          this.editingSection === 'billing'
        ) {

          this.draftEntity = {

            ...this.draftEntity,

            billing_method:

              this.draftEntity
                ?.billing_method ||

              'credit-card'
          };

        }  

      setTimeout(() => {

        this.saveState.saveFailed =
          false;

      }, 2000);

    },

  });

}

  get entityTypeLabel(): string {

    const entityType =
      this.draftEntity
        ?.entity_type as keyof typeof ENTITY_CONFIGS;

    return this
      .ENTITY_CONFIGS
      [entityType]
      ?.labels
      ?.entity || 'יישות';

  }

  isCheckingBillingConnection =
    false;

  testBillingConnection(): void {

    const start =
      Date.now();

    this.isCheckingBillingConnection =
      true;

    this.draftEntity = {

      ...this.draftEntity,

      cardcom_last_error:
        null
    };

    this.entitiesService.http.post<any>(

      `${environment.apiUrl}/api/payment/cardcom/test-connection`,

      {
        entityId:
          this.draftEntity.id,

        terminalNumber:
          this.draftEntity
            .cardcom_terminal_number,

        apiName:
          this.draftEntity
            .cardcom_api_username,

        apiPassword:
          this.draftEntity
            .cardcom_api_password,

        environment:
          'sandbox'
      }

    ).subscribe({

      next: (res) => {

        const elapsed =
          Date.now() - start;

        const remaining =
          Math.max(
            0,
            2000 - elapsed
          );

        setTimeout(() => {

          this.isCheckingBillingConnection =
            false;

          this.draftEntity = {

            ...this.draftEntity,

            cardcom_connection_status:

              res.success
                ? 'success'
                : 'failed',

            cardcom_last_verified_at:
              new Date(),

            cardcom_last_error:

              res.success
                ? null
                : (

                    res.message ||

                    res.error?.Description ||

                    'בדיקת החיבור נכשלה'
                  )
          };

        }, remaining);
      },

      error: (err) => {

        const elapsed =
          Date.now() - start;

        const remaining =
          Math.max(
            0,
            2000 - elapsed
          );

        setTimeout(() => {

          this.isCheckingBillingConnection =
            false;

          this.draftEntity = {

            ...this.draftEntity,

            cardcom_connection_status:
              'failed',

            cardcom_last_verified_at:
              new Date(),

            cardcom_last_error:

              err?.error?.message ||

              err?.error?.error?.Description ||

              'שגיאת שרת'
          };

        }, remaining);
      }
    });
  }
}