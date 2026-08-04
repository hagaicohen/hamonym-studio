import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EntitiesService } from '../../../../core/services/entities.service';

// Dedicated page for a Partner's own identity/contact details (name, phone,
// email, website, logo) — deliberately separate from the Partner Builder
// (partner-builder-page), which is purely about the public PAGE's content
// (blocks/layout). Mixing the two into one screen was tried and rejected —
// see docs/DECISIONS.md (2026-08-04): a manager wants "who is this
// business, how do I reach them" to be its own place, unrelated to editing
// what the page itself looks like.
//
// updateEntity is NOT a partial PATCH — entities.service.js's UPDATE sets
// every column unconditionally from `data`, so a payload with only these
// few fields would null out everything else on the row (legal_name, Cardcom
// credentials, billing, ...). fullEntity holds the complete loaded row; the
// form binds directly into it, and save() sends the whole object back —
// same defensive pattern entity-settings.component.ts uses for its own
// saveAll().
@Component({
  selector: 'app-partner-details-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './partner-details-page.component.html',
  styleUrl: './partner-details-page.component.css',
})
export class PartnerDetailsPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private entitiesService = inject(EntitiesService);

  entityId = '';
  loading = true;
  loadError = '';
  fullEntity: any = null;

  saving = false;
  saved = false;
  saveError = '';
  logoUploading = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.loadError = 'לא נמצא מזהה שותף.'; this.loading = false; return; }
    this.entityId = id;

    this.entitiesService.getEntityById(id).subscribe({
      next: entity => { this.fullEntity = entity; this.loading = false; },
      error: () => { this.loadError = 'לא נמצא שותף כזה, או שאין לכם גישה אליו.'; this.loading = false; },
    });
  }

  save(): void {
    if (!this.fullEntity) return;
    this.saving = true;
    this.saved = false;
    this.saveError = '';
    this.fullEntity.display_name = (this.fullEntity.display_name || '').trim();
    const payload = {
      ...this.fullEntity,
      // Blob-ish fields have their own dedicated upload endpoints (logo via
      // uploadLogo below) — never round-trip them through this general PATCH.
      logo_data: undefined,
      logo_file: undefined,
      association_certificate_data: undefined,
      tax_document_data: undefined,
    };
    this.entitiesService.updateEntity(this.entityId, payload).subscribe({
      next: updated => {
        this.saving = false;
        this.saved = true;
        if (updated) this.fullEntity = updated;
      },
      error: err => {
        this.saving = false;
        this.saveError = err?.error?.error || 'שגיאה בשמירת פרטי השותף';
      },
    });
  }

  onLogoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    this.logoUploading = true;
    this.entitiesService.uploadLogo(this.entityId, file).subscribe({
      next: (res: any) => {
        this.logoUploading = false;
        const url = res?.result?.logo_url || res?.logo_url;
        if (url && this.fullEntity) this.fullEntity.logo_url = url;
      },
      error: () => { this.logoUploading = false; },
    });
  }
}
