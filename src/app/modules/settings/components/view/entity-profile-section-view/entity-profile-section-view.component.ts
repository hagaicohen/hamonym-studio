import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';


import {
  LucideAngularModule,
  ImageIcon,
} from 'lucide-angular';

@Component({
  selector: 'app-entity-profile-section-view',
  standalone: true,
  imports: [CommonModule,LucideAngularModule],
  templateUrl: './entity-profile-section-view.component.html',

  styleUrls: ['./entity-profile-section-view.component.css'],
})
export class EntityProfileSectionViewComponent {
  @Input()
  entity: any;

  @Input()
  entityTypeLabel = '';

  @Input()
  campaignTypes: any[] = [];

  @Input()
  apiUrl = '';

  @Output()
  edit = new EventEmitter<void>();

  readonly ImageIcon = ImageIcon;

  getLogoUrl(): string {
    const logo = this.entity?.logo_url;

    if (!logo) {
      return '';
    }

    if (
      typeof logo === 'string' &&
      (logo.startsWith('http') || logo.startsWith('data:image'))
    ) {
      return logo;
    }

    return `${this.apiUrl}${logo}`;
  }
}
