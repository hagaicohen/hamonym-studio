import { Component, EventEmitter, Input, Output, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { ENTITY_CATEGORIES } from '../../../../../shared/config/entity-categories';

import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { EntitiesService } from '../../../../../core/services/entities.service';

@Component({
  selector: 'app-entity-basic-info-section-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entity-basic-info-section-view.component.html',
  styleUrl: './entity-basic-info-section-view.component.css',
})
export class EntityBasicInfoSectionViewComponent {
  private entitiesService = inject(EntitiesService);

  private sanitizer = inject(DomSanitizer);

  @Input()
  entity: any;

  @Input()
  editMode = false;

  @Output()
  entityChange = new EventEmitter<any>();

  categories = ENTITY_CATEGORIES;

  associationDocumentUrl?: SafeResourceUrl;

  taxDocumentUrl?: SafeResourceUrl;

  uploadingAssociation = false;

  uploadingTax = false;

  ngOnChanges() {
    if (!this.entity?.id) {
      return;
    }

    this.associationDocumentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      this.entitiesService.getAssociationDocumentUrl(this.entity.id),
    );

    this.taxDocumentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      this.entitiesService.getTaxDocumentUrl(this.entity.id),
    );
  }

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

  onFileSelected(event: Event, field: string) {
    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (field === 'association_certificate_url') {
      this.uploadingAssociation = true;

      this.entitiesService
        .uploadAssociationDocument(
          this.entity.id,

          file,
        )
        .subscribe({
          next: () => {
            this.uploadingAssociation = false;

            this.entity = {
              ...this.entity,

              association_certificate_name: file.name,
            };
          },

          error: () => {
            this.uploadingAssociation = false;
          },
        });

      return;
    }

    if (field === 'tax_document_url') {
      this.uploadingTax = true;

      this.entitiesService
        .uploadTaxDocument(
          this.entity.id,

          file,
        )
        .subscribe({
          next: () => {
            this.uploadingTax = false;

            this.entity = {
              ...this.entity,

              tax_document_name: file.name,
            };
          },

          error: () => {
            this.uploadingTax = false;
          },
        });
    }
  }

  getFileName(fileName: string): string {
    return fileName || '';
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

  getCategoryLabel(categoryId: string): string {
    return this.categories.find((c) => c.id === categoryId)?.label || '-';
  }
}
