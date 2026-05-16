import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

import {
  ENTITY_CATEGORIES
} from  '../../../../shared/config/entity-categories';

@Component({
  selector: 'app-entity-basic-info-card',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './entity-basic-info-card.component.html',
  styleUrls: ['./entity-basic-info-card.component.css']
})
export class EntityBasicInfoCardComponent {

  @Input()
  entity: any;

  @Input()
  editMode = false;

  @Output()
  entityChange =
    new EventEmitter<any>();

  categories =
    ENTITY_CATEGORIES;

  updateField(
    field: string,
    value: any
  ) {

    this.entityChange.emit({
      [field]: value
    });
  }

  toggleSecondaryCategory(
    categoryId: string
  ) {

    const current =
      this.entity?.secondary_categories || [];

    const exists =
      current.includes(categoryId);

    const updated =
      exists
        ? current.filter(
            (c: string) => c !== categoryId
          )
        : [
            ...current,
            categoryId
          ];

    this.updateField(
      'secondary_categories',
      updated
    );
  } 

  
  getCategoryLabel(
    categoryId: string
  ): string {

    return this.categories.find(
      c => c.id === categoryId
    )?.label || '-';
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