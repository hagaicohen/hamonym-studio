// entity-billing-section-edit.component.ts

import {
  Component,
  Input,
  inject,
  OnInit,
  ViewChild,
  EventEmitter,
  Output,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { ActivatedRoute } from '@angular/router';

import { LucideAngularModule, CreditCard } from 'lucide-angular';

import { BillingService } from '../../../../organization-registration/services/billing.service';

import { EntitiesService } from '../../../../../core/services/entities.service';

import { CurrentEntityService } from '../../../../../core/services/current-entity.service';

import { OpenfieldsFormComponent } from '../../../../billing/components/openfields-form/openfields-form.component';

import { SectionSaveState } from '../../../models/section-save-state.model';

type BillingMethod = 'credit-card' | 'masav';

@Component({
  selector: 'app-entity-billing-section-edit',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    OpenfieldsFormComponent,
  ],

  templateUrl: './entity-billing-section-edit.component.html',

  styleUrls: ['./entity-billing-section-edit.component.css'],
})
export class EntityBillingSectionEditComponent implements OnInit {
  private billingService = inject(BillingService);

  private entitiesService = inject(EntitiesService);

  private currentEntityService = inject(CurrentEntityService);

  private route = inject(ActivatedRoute);

  @ViewChild(OpenfieldsFormComponent)
  openfieldsForm?: OpenfieldsFormComponent;

  private _entity: any;

  /*
  |--------------------------------------------------------------------------
  | IMPORTANT
  | prevent UI hydration override
  |--------------------------------------------------------------------------
  */

  private manuallySelectedMasav = false;
  private manuallySelectedCreditCard = false;

  @Input()
  set entity(value: any) {
    this._entity = value;

    this.syncModeFromEntity();
  }

  get entity(): any {
    return this._entity;
  }

  @Input()
  saveState: SectionSaveState = {
    isSaving: false,

    saveCompleted: false,

    saveFailed: false,
  };

  @Output()
  save = new EventEmitter<void>();

  @Output()
  cancel = new EventEmitter<void>();

  @Output()
  entityChange = new EventEmitter<any>();

  readonly CreditCard = CreditCard;

  mode: 'connected' | 'replacing' | 'empty' = 'empty';

  ngOnInit(): void {
    this.entitiesService
      .getEntityById(this.entity.id)

      .subscribe({
        next: (res: any) => {
          const refreshedEntity = res.entity || res;

          this.entity = refreshedEntity;
        },

        error: (err: any) => {
          console.error(err);
        },
      });

    const lowProfileId = this.route.snapshot.queryParamMap.get('LowProfileId');

    const internalDealNumber =
      this.route.snapshot.queryParamMap.get('InternalDealNumber');

    if (!lowProfileId || !internalDealNumber) {
      return;
    }

    this.billingService
      .createEntityBilling({
        entityId: this.entity.id,

        provider: 'cardcom',

        lowProfileId,

        internalDealNumber,
      })

      .subscribe({
        next: () => {
          this.entitiesService
            .getEntityById(this.entity.id)

            .subscribe({
              next: (entityRes: any) => {
                const refreshedEntity = entityRes.entity || entityRes;

                this.entity = refreshedEntity;

                this.currentEntityService.setEntity(refreshedEntity);
              },

              error: (err: any) => {
                console.error(err);
              },
            });
        },

        error: (err: any) => {
          console.error(err);
        },
      });
  }

  private syncModeFromEntity(): void {
    /*
  |--------------------------------------------------------------------------
  | LOCAL CREDIT CARD SELECTION
  | MUST WIN OVER HYDRATION
  |--------------------------------------------------------------------------
  */

    if (this.manuallySelectedCreditCard) {
      if (this.entity?.billing_last4) {
        this.mode = 'connected';
      } else {
        this.mode = 'empty';
      }

      return;
    }

    /*
  |--------------------------------------------------------------------------
  | LOCAL MASAV SELECTION
  | MUST WIN OVER HYDRATION
  |--------------------------------------------------------------------------
  */

    if (this.manuallySelectedMasav) {
      this.mode = 'empty';

      return;
    }

    /*
  |--------------------------------------------------------------------------
  | MASAV FROM SERVER
  |--------------------------------------------------------------------------
  */

    if (this.entity?.billing_method === 'masav') {
      this.mode = 'empty';

      return;
    }

    /*
  |--------------------------------------------------------------------------
  | NEVER OVERRIDE REPLACE FLOW
  |--------------------------------------------------------------------------
  */

    if (this.mode === 'replacing') {
      return;
    }

    /*
  |--------------------------------------------------------------------------
  | CREDIT CARD
  |--------------------------------------------------------------------------
  */

    if (this.entity?.billing_last4) {
      this.mode = 'connected';
    } else {
      this.mode = 'empty';
    }
  }

  get billingMethod(): BillingMethod {
    /*
      IMPORTANT:
      local MASAV selection
      must override hydration
    */

    if (this.manuallySelectedMasav) {
      return 'masav';
    }

    return this.entity?.billing_method || 'credit-card';
  }

  get isCreditCard(): boolean {
    return this.billingMethod === 'credit-card';
  }

  get isMasav(): boolean {
    return this.billingMethod === 'masav';
  }

  get canSaveMasav(): boolean {
    return !!this.entity?.billing_masav_file_name;
  }

  selectBillingMethod(method: BillingMethod): void {
    /*
  |--------------------------------------------------------------------------
  | MASAV
  |--------------------------------------------------------------------------
  */

    if (method === 'masav') {
      this.manuallySelectedMasav = true;

      this.manuallySelectedCreditCard = false;

      this.mode = 'empty';

      /*
      IMPORTANT:
      DO NOT CLEAR CREDIT CARD YET.
      ONLY AFTER REAL SAVE.
    */

      this.entity = {
        ...this.entity,

        billing_method: 'masav',
      };
    } else {
      /*
    |--------------------------------------------------------------------------
    | CREDIT CARD
    |--------------------------------------------------------------------------
    */

      this.manuallySelectedMasav = false;

      this.manuallySelectedCreditCard = true;

      this.entity = {
        ...this.entity,

        billing_method: 'credit-card',

        /*
        CLEAR MASAV
      */

        billing_masav_file_name: null,
      };
    }

    this.entityChange.emit(this.entity);
  }
  onMasavFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files?.length) {
      return;
    }

    const file = input.files[0];

    this.entity = {
      ...this.entity,

      billing_method: 'masav',

      billing_masav_file_name: file.name,
    };

    this.entityChange.emit(this.entity);
  }

  removeMasavFile(): void {
    this.entity = {
      ...this.entity,

      billing_masav_file_name: null,
    };

    this.entityChange.emit(this.entity);
  }

  startReplaceCard(): void {
    this.mode = 'replacing';
  }
}
