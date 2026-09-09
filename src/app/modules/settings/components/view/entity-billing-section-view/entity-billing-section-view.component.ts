import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { LucideAngularModule, CreditCard, Pencil, TriangleAlert } from 'lucide-angular';

import { ISRAELI_BANKS } from '../../../../../shared/constants/israeli-banks.constants';

@Component({
  selector: 'app-entity-billing-section-view',

  standalone: true,

  imports: [CommonModule, LucideAngularModule],

  templateUrl: './entity-billing-section-view.component.html',

  styleUrls: ['./entity-billing-section-view.component.css'],
})
export class EntityBillingSectionViewComponent {
  @Input()
  entity: any;

  // Real entity_masav_details row (or null) -- same model the Super Admin
  // Billing Ops MASAV drawer reads/writes. Passed down by entity-settings.
  // component so this read-only card reflects real MASAV setup status
  // instead of the legacy billing_masav_file_name column, which nothing
  // writes to any more.
  @Input()
  masavConfig: any = null;

  @Input()
  hasUnsavedChanges = false;

  @Output()
  edit = new EventEmitter<void>();

  @Output()
  save = new EventEmitter<void>();

  @Output()
  cancel = new EventEmitter<void>();

  readonly CreditCard = CreditCard;
  readonly PencilIcon = Pencil;
  readonly AlertIcon = TriangleAlert;

  get isCreditCard(): boolean {
    return this.entity?.billing_method === 'credit-card';
  }

  get isMasav(): boolean {
    return this.entity?.billing_method === 'masav';
  }

  get hasBillingMethod(): boolean {
    /*
    |--------------------------------------------------------------------------
    | MASAV
    |--------------------------------------------------------------------------
    */

    if (this.entity?.billing_method === 'masav') {
      return !!this.masavConfig;
    }

    /*
    |--------------------------------------------------------------------------
    | CREDIT CARD
    |--------------------------------------------------------------------------
    */

    return !!this.entity?.billing_last4;
  }

  get masavStatusLabel(): string {
    if (this.masavConfig?.authorized) return 'ההרשאה אושרה';
    if (this.masavConfig?.has_authorization_document) return 'ממתין לאישור מנהל הפלטפורמה';
    return 'פרטי בנק נשמרו — טרם הועלה אישור מהבנק';
  }

  // Bank was historically free-text before the dropdown (2026-09-09); an
  // unrecognized code (only possible for data saved before the dropdown
  // existed) falls back to showing the raw code rather than hiding it.
  get masavBankName(): string {
    const bank = ISRAELI_BANKS.find((b) => b.code === this.masavConfig?.bank_code);
    return bank?.name || this.masavConfig?.bank_code || '—';
  }
}
