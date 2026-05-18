import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

@Component({
  selector: 'app-entity-payment-section-view',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './entity-payment-section-view.component.html',
  styleUrl: './entity-payment-section-view.component.css'
})
export class EntityPaymentSectionViewComponent {

  @Input()
  entity: any;

  @Output()
  edit =
    new EventEmitter<void>();

  @Output()
  testConnection =
    new EventEmitter<void>();

 get statusLabel(): string {

  switch (
    this.entity?.cardcom_connection_status
  ) {

    case 'success':
      return 'פעיל';

    case 'failed':
      return 'שגיאת חיבור';

    case 'skipped':
      return 'לא הוגדר';

    default:
      return 'לא הוגדר';
  }
}

  get statusClass(): string {

    switch (
      this.entity?.cardcom_connection_status
    ) {

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