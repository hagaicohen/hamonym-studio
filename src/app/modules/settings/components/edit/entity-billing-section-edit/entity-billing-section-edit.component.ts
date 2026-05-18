import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  LucideAngularModule,
  CreditCard
} from 'lucide-angular';

type BillingMethod = 'credit-card' | 'masav';

@Component({
  selector: 'app-entity-billing-section-edit',
  standalone: true,
  imports: [CommonModule, FormsModule,LucideAngularModule],
  templateUrl: './entity-billing-section-edit.component.html',
  styleUrls: ['./entity-billing-section-edit.component.css'],
})
export class EntityBillingSectionEditComponent {
  @Input()
  entity: any;

  readonly CreditCard = CreditCard;

  get billingMethod(): BillingMethod {
    return this.entity?.billing_method || 'credit-card';
  }

  get isCreditCard(): boolean {
    return this.billingMethod === 'credit-card';
  }

  get isMasav(): boolean {
    return this.billingMethod === 'masav';
  }

  selectBillingMethod(method: BillingMethod): void {
    this.entity.billing_method = method;
  }

  formatCardNumber(): void {
    const rawValue = this.entity.billing_card_number
      ?.replace(/\s/g, '')
      ?.replace(/[^0-9]/gi, '');

    const groups = rawValue?.match(/.{1,4}/g);

    this.entity.billing_card_number = groups ? groups.join(' ') : '';
  }

  formatExpiry(): void {
    const rawValue = this.entity.billing_card_expiry?.replace(/\D/g, '');

    if (rawValue?.length >= 3) {
      this.entity.billing_card_expiry =
        rawValue.substring(0, 2) + '/' + rawValue.substring(2, 4);

      return;
    }

    this.entity.billing_card_expiry = rawValue;
  }

  onMasavFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files?.length) {
      return;
    }

    const file = input.files[0];

    this.entity.billing_masav_file_name = file.name;
  }

  removeMasavFile(): void {
    this.entity.billing_masav_file_name = null;
  }

  onlyNumbers(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',

      'ArrowLeft',

      'ArrowRight',

      'Tab',

      'Delete',
    ];

    if (allowedKeys.includes(event.key)) {
      return;
    }

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }
}
