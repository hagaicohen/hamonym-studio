import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-entity-payment-section-edit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entity-payment-section-edit.component.html',
  styleUrl: './entity-payment-section-edit.component.css',
})
export class EntityPaymentSectionEditComponent {
  @Input()
  model: any;

  @Input()
  isCheckingConnection = false;

  @Output()
  save = new EventEmitter<any>();

  @Output()
  cancel = new EventEmitter<void>();

  @Output()
  testConnection = new EventEmitter<any>();

  get canSave(): boolean {
    if (this.model?.billing_skip_setup) {
      return true;
    }

    return !!(
      this.model?.billing_provider &&
      this.model?.cardcom_terminal_number?.trim() &&
      this.model?.cardcom_api_username?.trim() &&
      this.model?.cardcom_api_password?.trim()
    );
  }

  get statusLabel(): string {
    switch (this.model?.cardcom_connection_status) {
      case 'success':
        return 'חיבור תקין';

      case 'failed':
        return 'חיבור נכשל';

      /*case 'skipped':
        return 'ימולא בהמשך';*/

      default:
        return 'טרם נבדק';
    }
  }

  get statusClass(): string {
    switch (this.model?.cardcom_connection_status) {
      case 'success':
        return 'success';

      case 'failed':
        return 'failed';

      case 'skipped':
        return 'skipped';

      default:
        return 'not-tested';
    }
  }
}
