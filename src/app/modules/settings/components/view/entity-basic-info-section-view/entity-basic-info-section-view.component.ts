import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  OnChanges
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule
} from '@angular/forms';

import {
  ENTITY_CATEGORIES
} from '../../../../../shared/config/entity-categories';

import {
  DomSanitizer,
  SafeResourceUrl
} from '@angular/platform-browser';

import {
  EntitiesService
} from '../../../../../core/services/entities.service';

import {
  LucideAngularModule,
  Building2
} from 'lucide-angular';

@Component({
  selector:
    'app-entity-basic-info-section-view',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule
  ],

  templateUrl:
    './entity-basic-info-section-view.component.html',

  styleUrl:
    './entity-basic-info-section-view.component.css',
})
export class EntityBasicInfoSectionViewComponent   implements OnChanges {

  private entitiesService =
    inject(EntitiesService);

  private sanitizer =
    inject(DomSanitizer);

  readonly Building2 =
    Building2;

  @Input()
  entity: any;

  @Output()
  edit =
    new EventEmitter<void>();

  categories =
    ENTITY_CATEGORIES;

  associationDocumentUrl?:
    SafeResourceUrl;

  taxDocumentUrl?:
    SafeResourceUrl;

  ngOnChanges(): void {

    if (!this.entity?.id) {
      return;
    }

    this.associationDocumentUrl =

      this.sanitizer
        .bypassSecurityTrustResourceUrl(

          this.entitiesService
            .getAssociationDocumentUrl(
              this.entity.id
            )

        );

    this.taxDocumentUrl =

      this.sanitizer
        .bypassSecurityTrustResourceUrl(

          this.entitiesService
            .getTaxDocumentUrl(
              this.entity.id
            )

        );

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

  getCategoryLabel(
    categoryId: string
  ): string {

    return this.categories
      .find(
        (c) => c.id === categoryId
      )?.label || '-';

  }

}