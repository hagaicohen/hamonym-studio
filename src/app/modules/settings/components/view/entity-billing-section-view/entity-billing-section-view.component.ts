import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-entity-billing-section-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './entity-billing-section-view.component.html',
  styleUrls: ['./entity-billing-section-view.component.css'],
})
export class EntityBillingSectionViewComponent {
  @Input()
  entity: any;

  @Output()
  edit = new EventEmitter<void>();

  get isCreditCard(): boolean {
    return this.entity?.billing_method === 'credit-card';
  }

  get isMasav(): boolean {
    return this.entity?.billing_method === 'masav';
  }

  get statusLabel(): string {
    switch (this.entity?.billing_status) {
      case 'active':
        return 'פעיל';

      case 'pending':
        return 'ממתין לאישור';

      default:
        return 'לא הוגדר';
    }
  }

  get statusClass(): string {
    switch (this.entity?.billing_status) {
      case 'active':
        return 'success';

      case 'pending':
        return 'pending';

      default:
        return 'not-configured';
    }
  }
}
