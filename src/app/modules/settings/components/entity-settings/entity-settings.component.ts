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
  Router
} from '@angular/router';

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
    private router: Router
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

  isSaving = false;

  saveSuccess = false;

  saveError = '';

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

  startEdit(): void {

    this.saveError = '';

    this.draftEntity =
      structuredClone(
        this.entity
      );

    this.editMode =
      true;

  }

  cancelEdit(): void {

    this.saveError = '';

    this.draftEntity =
      structuredClone(
        this.entity
      );

    this.editMode =
      false;

  }

  async saveAll(): Promise<void> {

    console.log(
      'SAVE ALL STARTED'
    );

    this.saveError = '';

    if (
      !this.draftEntity?.id ||
      this.isSaving
    ) {
      return;
    }

    this.isSaving =
      true;

    /* =========================
       TOKENIZE NEW CARD
    ========================= */

    const billingComponent =

      document.querySelector(
        'app-entity-billing-section-edit'
      );

    const isReplacingCard =

      billingComponent
        ?.querySelector(
          'app-openfields-form'
        );

    console.log(
      'BILLING SECTION INSTANCE',
      this.billingSection
    );

    console.log(
      'OPENFIELDS INSTANCE',
      this.billingSection
        ?.openfieldsForm
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

      console.log(
        'TOKENIZE FROM SAVE',
        tokenized
      );

      if (!tokenized) {

        this.saveError =

          'שמירת כרטיס האשראי נכשלה';

        this.isSaving =
          false;

        setTimeout(() => {

          this.saveError = '';

        }, 3000);

        return;

      }

    }

    const optimisticEntity =
      structuredClone(

        this.draftEntity

      );

    // optimistic UI

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

    // =====================================================
    // CLEAN PAYLOAD
    // =====================================================

    const payload = {

      ...this.draftEntity,

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

      .pipe(

        finalize(() => {

          this.isSaving =
            false;

        }),

      )

      .subscribe({

        next: (updatedEntity) => {

          this.entity =
            structuredClone(

              updatedEntity

            );

          this.draftEntity =
            structuredClone(

              updatedEntity

            );

          this.currentEntityService
            .setEntity(
              updatedEntity
            );

          /* =========================
             REFRESH ENTITY WITH BILLING
          ========================= */

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

                /*
                  IMPORTANT:
                  close edit mode
                  only after fresh billing data
                */

                this.editMode =
                  false;

              },

              error: (err: any) => {

                console.error(err);

              }

            });

          this.saveSuccess =
            true;

          setTimeout(() => {

            this.router.navigate([
              '/campaigns'
            ]);

          }, 1200);

          setTimeout(() => {

            this.saveSuccess =
              false;

          }, 1600);

        },

        error: (err) => {

          console.error(err);

          this.saveError =

            'אירעה שגיאה בשמירת הנתונים';

          setTimeout(() => {

            this.saveError = '';

          }, 3000);

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

  // =========================
  // BILLING CONNECTION TEST
  // =========================

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