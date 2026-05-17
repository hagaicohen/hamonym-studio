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
  selector: 'app-entity-billing-settings-view',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl:
    './entity-billing-settings-view.component.html',
  styleUrls: [
    './entity-billing-settings-view.component.css'
  ]
})
export class EntityBillingSettingsViewComponent {

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
        return 'חיבור תקין';

      case 'failed':
        return 'חיבור נכשל';

      case 'skipped':
        return 'ימולא בהמשך';

      default:
        return 'טרם נבדק';
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