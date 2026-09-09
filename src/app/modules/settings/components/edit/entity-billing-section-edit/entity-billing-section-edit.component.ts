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

import { firstValueFrom } from 'rxjs';

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
  MASAV_WHY_UNLIMITED_TITLE,
  MASAV_WHY_UNLIMITED_TEXT,
  MASAV_UPLOAD_HELPER_TEXT,
  MASAV_PENDING_STATUS_LABEL,
  MASAV_PENDING_STATUS_SUBLABEL,
} from '../../../../../shared/constants/masav.constants';

import { ISRAELI_BANKS, IsraeliBank } from '../../../../../shared/constants/israeli-banks.constants';

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
  readonly masavWhyUnlimitedTitle = MASAV_WHY_UNLIMITED_TITLE;
  readonly masavWhyUnlimitedText = MASAV_WHY_UNLIMITED_TEXT;
  readonly masavUploadHelperText = MASAV_UPLOAD_HELPER_TEXT;
  readonly masavPendingStatusLabel = MASAV_PENDING_STATUS_LABEL;
  readonly masavPendingStatusSublabel = MASAV_PENDING_STATUS_SUBLABEL;

  masavCodeCopied = false;
  masavShowHelp = false;
  masavAckChecked = false;

  readonly israeliBanks: IsraeliBank[] = ISRAELI_BANKS;

  masavBankCode = '';
  masavBranchCode = '';
  masavAccountNumber = '';
  masavAccountHolderName = '';

  masavDocFile: File | null = null;
  masavDocDownloading = false;

  // Unified submit: one association-facing action saves the bank details
  // and (if a file was chosen) uploads the authorization document right
  // after, in sequence -- there is no longer a separate "save bank details"
  // step the association has to complete before they're even allowed to
  // pick a file. This also removes the "stale unsaved details" upload risk
  // structurally, not by tracking dirtiness: every upload is immediately
  // preceded by a fresh save of the exact fields on screen, every time.
  masavSubmitBusy = false;
  masavFormError: string | null = null;

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

  onMasavDocSelected(event: Event): void {
    // File-selection only -- does NOT upload. The file rides along as part
    // of the single "שמירת אמצעי החיוב" action (onSaveClick below), exactly
    // like every other section's file inputs already work in this same
    // settings page (tax document, association certificate, logo -- see
    // entity-settings.component.ts#saveAll, which uploads those only when
    // the outer save button is actually pressed).
    const input = event.target as HTMLInputElement;
    this.masavDocFile = input.files?.[0] || null;
    this.masavFormError = null;
  }

  // Called by the single card-level "שמירת אמצעי החיוב" button (see
  // onSaveClick) -- never rendered as its own button. Validates, then saves
  // bank details and (only if a new file was chosen) uploads the
  // authorization document, in sequence. Two real API calls under the
  // hood (upsertMasavConfig + uploadMasavAuthorizationDocument),
  // orchestrated from here rather than merged into a second data model.
  // Never touches `authorized` -- that stays Super-Admin-only.
  private async saveMasavIfNeeded(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isMasav) return { ok: true };
    if (!this.entity?.id) return { ok: false, error: 'לא ניתן לשמור — עמותה לא נמצאה' };

    if (!this.masavAckChecked) {
      return { ok: false, error: 'יש לאשר את ההצהרה על תנאי ההרשאה כדי לשמור' };
    }
    if (!this.masavAccountHolderName || !this.masavBankCode || !this.masavBranchCode || !this.masavAccountNumber) {
      return { ok: false, error: 'יש למלא את כל פרטי חשבון הבנק (בנק, סניף, מספר חשבון, שם בעל החשבון)' };
    }

    try {
      const res: any = await firstValueFrom(
        this.billingService.upsertMasavConfig(this.entity.id, {
          bankCode: this.masavBankCode,
          branchCode: this.masavBranchCode,
          accountNumber: this.masavAccountNumber,
          accountHolderName: this.masavAccountHolderName || undefined,
        }),
      );
      this.masavConfig = res.config;
      this.masavConfigChange.emit(this.masavConfig);
    } catch (err: any) {
      return { ok: false, error: err?.error?.error || 'שמירת פרטי הבנק נכשלה' };
    }

    // No new file chosen -- an existing uploaded document (if any) is left
    // exactly as-is, never re-uploaded unnecessarily.
    if (!this.masavDocFile) return { ok: true };

    try {
      const res: any = await firstValueFrom(
        this.billingService.uploadMasavAuthorizationDocument(this.entity.id, this.masavDocFile),
      );
      this.masavConfig = res.config;
      this.masavConfigChange.emit(this.masavConfig);
      this.masavDocFile = null;
      return { ok: true };
    } catch (err: any) {
      // Bank details already saved above -- only the document upload
      // failed. Say so precisely; do not report a full failure, and never
      // lose the already-selected file or typed data.
      return {
        ok: false,
        error:
          'פרטי החשבון נשמרו בהצלחה, אך העלאת האישור נכשלה' +
          (err?.error?.error ? ` (${err.error.error})` : '') +
          '. ניתן ללחוץ שוב על "שמירת אמצעי החיוב" כדי לנסות להעלות את הקובץ מחדש, מבלי להזין דבר מחדש.',
      };
    }
  }

  // The single "שמירת אמצעי החיוב" button in the card header calls this
  // instead of emitting `save` directly. For credit-card mode, behavior is
  // unchanged (immediate emit -- entity-settings.component.ts#saveAll
  // already handles card tokenization). For MASAV, the bank-details-save +
  // document-upload sequence runs first as ONE user-facing action; only on
  // success does the generic entity save (billing_method etc.) proceed --
  // a MASAV failure must never look like the card silently saved anyway.
  async onSaveClick(): Promise<void> {
    if (this.saveState.isSaving || this.masavSubmitBusy) return;

    if (this.isMasav) {
      this.masavSubmitBusy = true;
      this.masavFormError = null;

      const result = await this.saveMasavIfNeeded();

      this.masavSubmitBusy = false;

      if (!result.ok) {
        this.masavFormError = result.error || 'שמירת אמצעי החיוב נכשלה';
        return;
      }
    }

    this.save.emit();
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
