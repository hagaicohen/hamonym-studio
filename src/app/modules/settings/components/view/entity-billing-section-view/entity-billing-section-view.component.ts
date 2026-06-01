import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { LucideAngularModule, CreditCard } from 'lucide-angular';

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

  @Output()
  edit = new EventEmitter<void>();

  readonly CreditCard = CreditCard;

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
      return !!this.entity?.billing_masav_file_name;
    }

    /*
    |--------------------------------------------------------------------------
    | CREDIT CARD
    |--------------------------------------------------------------------------
    */

    return !!this.entity?.billing_last4;
  }
}
