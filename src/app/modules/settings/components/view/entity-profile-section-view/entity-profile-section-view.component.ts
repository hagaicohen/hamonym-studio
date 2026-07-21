import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { LucideAngularModule, ImageIcon, Pencil, TriangleAlert } from 'lucide-angular';

@Component({
  selector: 'app-entity-profile-section-view',

  standalone: true,

  imports: [CommonModule, LucideAngularModule],

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
  hasUnsavedChanges = false;

  @Output() edit = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  readonly ImageIcon = ImageIcon;
  readonly PencilIcon = Pencil;
  readonly AlertIcon = TriangleAlert;

  logoLoaded = false;

  getLogoUrl(): string {
    return this.entity?.logo_url || '';
  }
}
