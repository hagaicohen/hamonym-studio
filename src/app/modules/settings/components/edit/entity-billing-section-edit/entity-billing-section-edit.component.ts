// entity-billing-section-edit.component.ts

import {
  Component,
  Input,
  inject,
  OnInit,
  OnChanges,
  SimpleChanges,
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

import {
  MASAV_INSTITUTION_CODE,
  MASAV_BENEFICIARY_NAME,
  MASAV_ACK_TEXT,
} from '../../../../../shared/constants/masav.constants';

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
export class EntityBillingSectionEditComponent implements OnInit, OnChanges {
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

  // Real entity_masav_details row (or null if none yet) -- same model the
  // Super Admin Billing Ops MASAV drawer reads/writes. Fetched once by the
  // parent (entity-settings.component) so the read-only view card is
  // accurate on first paint too; this component keeps it current locally
  // after its own writes and reports back via masavConfigChange.
  @Input()
  masavConfig: any = null;

  @Output()
  masavConfigChange = new EventEmitter<any>();

  @Output()
  save = new EventEmitter<void>();

  @Output()
  cancel = new EventEmitter<void>();

  @Output()
  entityChange = new EventEmitter<any>();

  readonly CreditCard = CreditCard;

  mode: 'connected' | 'replacing' | 'empty' = 'empty';

  // ---- MASAV self-service setup ------------------------------------------
  readonly masavInstitutionCode = MASAV_INSTITUTION_CODE;
  readonly masavBeneficiaryName = MASAV_BENEFICIARY_NAME;
  readonly masavAckText = MASAV_ACK_TEXT;

  masavCodeCopied = false;
  masavShowHelp = false;
  masavAckChecked = false;

  masavBankCode = '';
  masavBranchCode = '';
  masavAccountNumber = '';
  masavAccountHolderName = '';
  masavFormBusy = false;
  masavFormError: string | null = null;

  masavDocFile: File | null = null;
  masavDocUploading = false;
  masavDocUploadError: string | null = null;
  masavDocDownloading = false;

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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['masavConfig']) {
      this.prefillMasavFields();
    }
  }

  private prefillMasavFields(): void {
    if (!this.masavConfig) return;

    this.masavBankCode = this.masavConfig.bank_code || '';
    this.masavBranchCode = this.masavConfig.branch_code || '';
    this.masavAccountNumber = this.masavConfig.account_number || '';
    this.masavAccountHolderName = this.masavConfig.account_holder_name || '';
  }

  toggleMasavHelp(): void {
    this.masavShowHelp = !this.masavShowHelp;
  }

  // Clipboard write is inherently best-effort (permissions, insecure
  // context, older browsers) -- falls back to silently doing nothing rather
  // than throwing, since the code is already displayed in plain text right
  // next to the button either way.
  copyMasavInstitutionCode(): void {
    navigator.clipboard?.writeText(this.masavInstitutionCode).then(() => {
      this.masavCodeCopied = true;
      setTimeout(() => { this.masavCodeCopied = false; }, 2000);
    }).catch(() => {});
  }

  // Saves bank details only, independent of the outer "שמירה"/"ביטול" card
  // buttons -- same real entity_masav_details model + upsertMasavConfig
  // endpoint the Super Admin drawer uses, just through the entity-ownership-
  // checked route instead of the superAdminGuard one.
  submitMasavConfig(): void {
    if (!this.entity?.id || this.masavFormBusy) return;
    if (!this.masavAccountHolderName || !this.masavBankCode || !this.masavBranchCode || !this.masavAccountNumber) {
      this.masavFormError = 'יש למלא שם בעל חשבון, בנק, סניף ומספר חשבון';
      return;
    }
    this.masavFormBusy = true;
    this.masavFormError = null;
    this.billingService
      .upsertMasavConfig(this.entity.id, {
        bankCode: this.masavBankCode,
        branchCode: this.masavBranchCode,
        accountNumber: this.masavAccountNumber,
        accountHolderName: this.masavAccountHolderName || undefined,
      })
      .subscribe({
        next: (res: any) => {
          this.masavFormBusy = false;
          this.masavConfig = res.config;
          this.masavConfigChange.emit(this.masavConfig);
        },
        error: (err: any) => {
          this.masavFormBusy = false;
          this.masavFormError = err?.error?.error || 'שמירת פרטי הבנק נכשלה';
        },
      });
  }

  onMasavDocSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.masavDocFile = input.files?.[0] || null;
    this.masavDocUploadError = null;
  }

  uploadMasavDoc(): void {
    if (!this.entity?.id || !this.masavDocFile || this.masavDocUploading) return;
    this.masavDocUploading = true;
    this.masavDocUploadError = null;
    this.billingService.uploadMasavAuthorizationDocument(this.entity.id, this.masavDocFile).subscribe({
      next: (res: any) => {
        this.masavDocUploading = false;
        this.masavConfig = res.config;
        this.masavConfigChange.emit(this.masavConfig);
        this.masavDocFile = null;
      },
      error: (err: any) => {
        this.masavDocUploading = false;
        this.masavDocUploadError = err?.error?.error || 'העלאת האישור נכשלה — ודאו שפרטי הבנק נשמרו קודם';
      },
    });
  }

  downloadMasavDoc(): void {
    if (!this.entity?.id || this.masavDocDownloading || !this.masavConfig?.has_authorization_document) return;
    this.masavDocDownloading = true;
    this.billingService.downloadMasavAuthorizationDocument(this.entity.id).subscribe({
      next: (blob: Blob) => {
        this.masavDocDownloading = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.masavConfig?.authorization_document_name || 'masav-authorization';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => { this.masavDocDownloading = false; },
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
      };
    }

    this.entityChange.emit(this.entity);
  }

  startReplaceCard(): void {
    this.mode = 'replacing';
  }
}
