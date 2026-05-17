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
  selector: 'app-entity-profile-section',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl:
    './entity-profile-section.component.html',

  styleUrls: [
    './entity-profile-section.component.css'
  ]
})
export class EntityProfileSectionComponent {

  @Input()
  entity: any;

  @Input()
  entityTypeLabel = '';

  @Input()
  campaignTypes: any[] = [];

  @Input()
  apiUrl = '';

  @Output()
  edit =
    new EventEmitter<void>();

  getLogoUrl(): string {

    if (!this.entity?.logo_url) {
      return '';
    }

    if (
      this.entity.logo_url.startsWith('http')
    ) {
      return this.entity.logo_url;
    }

    return `${this.apiUrl}${this.entity.logo_url}`;

  }

}