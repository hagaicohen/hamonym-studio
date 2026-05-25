// entity-billing-section-edit.component.ts

import {
  Component,
  Input,
  inject,
  OnInit,
  ViewChild,
  EventEmitter,
  Output
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

import {
  ActivatedRoute
} from '@angular/router';

import {
  LucideAngularModule,
  CreditCard
} from 'lucide-angular';

import {
  BillingService
} from '../../../../organization-registration/services/billing.service';

import {
  EntitiesService
} from '../../../../../core/services/entities.service';

import {
  CurrentEntityService
} from '../../../../../core/services/current-entity.service';

import {
  OpenfieldsFormComponent
} from '../../../../billing/components/openfields-form/openfields-form.component';
import { SectionSaveState } from '../../../models/section-save-state.model';

type BillingMethod =
  'credit-card' |
  'masav';

@Component({
  selector:
    'app-entity-billing-section-edit',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    OpenfieldsFormComponent
  ],

  templateUrl:
    './entity-billing-section-edit.component.html',

  styleUrls: [
    './entity-billing-section-edit.component.css'
  ],
})
export class EntityBillingSectionEditComponent
  implements OnInit {

  private billingService =
    inject(BillingService);

  private entitiesService =
    inject(EntitiesService);

  private currentEntityService =
    inject(CurrentEntityService);

  private route =
    inject(ActivatedRoute);

  @ViewChild(OpenfieldsFormComponent)
  openfieldsForm?: OpenfieldsFormComponent;

  /* =====================================
     ENTITY INPUT
  ===================================== */

  private _entity: any;

  @Input()
  set entity(value: any) {

    this._entity = value;

    this.syncModeFromEntity();

  }

  @Input()
saveState: SectionSaveState = {

  isSaving: false,

  saveCompleted: false,

  saveFailed: false
};

@Output()
save =
  new EventEmitter<void>();

@Output()
cancel =
  new EventEmitter<void>();
  
  get entity(): any {

    return this._entity;

  }

  readonly CreditCard =
    CreditCard;

  mode:
    'connected' |
    'replacing' |
    'empty' = 'empty';

  ngOnInit(): void {

    console.log(
      'QUERY PARAMS',
      window.location.href
    );

    /* =========================
       FULL HYDRATION
    ========================= */

    this.entitiesService
      .getEntityById(this.entity.id)

      .subscribe({

        next: (res: any) => {

          console.log(
            'FULL ENTITY',
            res
          );

          const refreshedEntity =

            res.entity || res;

          this.entity =
            refreshedEntity;

        },

        error: (err: any) => {

          console.error(err);

        }

      });

    /* =========================
       CARDCOM RETURN
    ========================= */

    const lowProfileId =

      this.route.snapshot
        .queryParamMap
        .get('LowProfileId');

    const internalDealNumber =

      this.route.snapshot
        .queryParamMap
        .get('InternalDealNumber');

    if (
      !lowProfileId ||
      !internalDealNumber
    ) {
      return;
    }

    this.billingService
      .createEntityBilling({

        entityId:
          this.entity.id,

        provider:
          'cardcom',

        lowProfileId,

        internalDealNumber

      })

      .subscribe({

        next: () => {

          this.entitiesService
            .getEntityById(this.entity.id)

            .subscribe({

              next: (entityRes: any) => {

                console.log(
                  'REFRESHED ENTITY',
                  entityRes
                );

                const refreshedEntity =

                  entityRes.entity ||
                  entityRes;

                this.entity =
                  refreshedEntity;

                this.currentEntityService
                  .setEntity(
                    refreshedEntity
                  );

              },

              error: (err: any) => {

                console.error(err);

              }

            });

        },

        error: (err: any) => {

          console.error(err);

        }

      });

  }

  /* =====================================
     MODE SYNC
  ===================================== */

  private syncModeFromEntity(): void {

    /*
      IMPORTANT:
      Don't override replace flow
    */

    if (
      this.mode ===
      'replacing'
    ) {
      return;
    }

    if (
      this.entity?.billing_last4
    ) {

      this.mode =
        'connected';

    } else {

      this.mode =
        'empty';

    }

  }

  get billingMethod(): BillingMethod {

    return this.entity?.billing_method ||
      'credit-card';

  }

  get isCreditCard(): boolean {

    return this.billingMethod ===
      'credit-card';

  }

  get isMasav(): boolean {

    return this.billingMethod ===
      'masav';

  }

  selectBillingMethod(
    method: BillingMethod
  ): void {

    this.entity.billing_method =
      method;

  }

  onMasavFileSelected(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    if (!input.files?.length) {
      return;
    }

    const file =
      input.files[0];

    this.entity.billing_masav_file_name =
      file.name;

  }

  removeMasavFile(): void {

    this.entity.billing_masav_file_name =
      null;

  }

  startReplaceCard(): void {

    this.mode =
      'replacing';

  }

}