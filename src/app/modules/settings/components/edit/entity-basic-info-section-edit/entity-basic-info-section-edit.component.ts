import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { ENTITY_CATEGORIES } from '../../../../../shared/config/entity-categories';


import {
  LucideAngularModule,
  Building2
} from 'lucide-angular';

@Component({
  selector: 'app-entity-basic-info-section-edit',
  standalone: true,
  imports: [CommonModule, FormsModule,LucideAngularModule],
  templateUrl: './entity-basic-info-section-edit.component.html',
  styleUrl: './entity-basic-info-section-edit.component.css',
})
export class EntityBasicInfoSectionEditComponent {
  @Input()
  entity: any;

  @Input()
  editMode = false;

  @Output()
  entityChange = new EventEmitter<any>();

  categories = ENTITY_CATEGORIES;

  readonly Building2 = Building2;

  updateField(field: string, value: any) {
    this.entityChange.emit({
      [field]: value,
    });
  }

  toggleSecondaryCategory(categoryId: string) {
    const current = this.entity?.secondary_categories || [];

    const exists = current.includes(categoryId);

    const updated = exists
      ? current.filter((c: string) => c !== categoryId)
      : [...current, categoryId];

    this.updateField('secondary_categories', updated);
  }

  getCategoryLabel(categoryId: string): string {
    return this.categories.find((c) => c.id === categoryId)?.label || '-';
  }

  get entityTypeLabel(): string {
    switch (this.entity?.entity_type) {
      case 'association':
        return 'עמותה';

      case 'chalatz':
        return 'חל״צ';

      case 'company':
        return 'חברה';

      default:
        return 'יישות';
    }
  }
}
