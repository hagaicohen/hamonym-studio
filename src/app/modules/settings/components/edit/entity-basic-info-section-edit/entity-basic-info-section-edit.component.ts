// entity-basic-info-section-edit.component.ts

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
  selector: 'app-entity-basic-info-section-edit',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule
  ],

  templateUrl:
    './entity-basic-info-section-edit.component.html',

  styleUrl:
    './entity-basic-info-section-edit.component.css',
})
export class EntityBasicInfoSectionEditComponent
  implements OnChanges {

  private entitiesService =
    inject(EntitiesService);

  private sanitizer =
    inject(DomSanitizer);

  @Input()
  entity: any;

  @Input()
  editMode = false;

  @Input()
  isSaving = false;

  @Output()
  entityChange =
    new EventEmitter<any>();

  @Output()
  save =
    new EventEmitter<void>();

  @Output()
  cancel =
    new EventEmitter<void>();

  categories =
    ENTITY_CATEGORIES;

  readonly Building2 =
    Building2;

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

  updateField(
    field: string,
    value: any
  ) {

    this.entityChange.emit({
      [field]: value,
    });

  }

  toggleSecondaryCategory(
    categoryId: string
  ) {

    const current =
      this.entity?.secondary_categories || [];

    const exists =
      current.includes(categoryId);

    const updated = exists
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

  onAssociationCertificateSelected(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) {
      return;
    }

    this.updateField(
      'association_certificate_file',
      file
    );

    this.updateField(
      'association_certificate_name',
      file.name
    );

  }

  onTaxDocumentSelected(
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) {
      return;
    }

    this.updateField(
      'tax_document_file',
      file
    );

    this.updateField(
      'tax_document_name',
      file.name
    );

  }

  removeAssociationCertificate(): void {

    this.updateField(
      'association_certificate_file',
      null
    );

    this.updateField(
      'association_certificate_name',
      null
    );

  }

  removeTaxDocument(): void {

    this.updateField(
      'tax_document_file',
      null
    );

    this.updateField(
      'tax_document_name',
      null
    );

  }

  getCategoryLabel(
    categoryId: string
  ): string {

    return this.categories
      .find(
        (c) => c.id === categoryId
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