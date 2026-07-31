import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EntitiesService } from '../../../../core/services/entities.service';

interface PartnerRow {
  id: string;
  display_name: string;
  logo_url: string | null;
  website: string | null;
}

// Standalone Partner back-office (Scenario 0 / "Partner First" — see
// docs/PARTNER_DOMAIN_MODEL_ADR.md §11). Partner is an independent Entity
// (0..N CampaignPartners, never the reverse) — this is the primary entry
// point for creating/managing one, not a side effect of editing a
// campaign. The "חבר שותף" flow inside Offerings stays as a shortcut for
// convenience, not the only way in.
@Component({
  selector: 'app-partners-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './partners-list-page.component.html',
  styleUrl: './partners-list-page.component.css',
})
export class PartnersListPageComponent implements OnInit {
  private entitiesService = inject(EntitiesService);
  private router = inject(Router);

  partners: PartnerRow[] = [];
  loading = true;

  showCreateForm = false;
  newPartner = { display_name: '', website: '', contact_email: '', contact_phone: '' };
  creating = false;
  createError = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.entitiesService.getMyPartners().subscribe({
      next: res => { this.partners = res.partners; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  createPartner(): void {
    if (!this.newPartner.display_name.trim()) return;
    this.creating = true;
    this.createError = '';
    this.entitiesService.createEntity({
      display_name: this.newPartner.display_name.trim(),
      website: this.newPartner.website.trim() || undefined,
      contact_email: this.newPartner.contact_email.trim() || undefined,
      contact_phone: this.newPartner.contact_phone.trim() || undefined,
    }).subscribe({
      next: res => {
        const entityId = res.entity.id;
        this.entitiesService.addRole(entityId, 'partner').subscribe({
          next: () => { this.creating = false; this.router.navigate(['/partners', entityId, 'builder']); },
          error: () => { this.creating = false; this.createError = 'שגיאה ביצירת השותף'; },
        });
      },
      error: () => { this.creating = false; this.createError = 'שגיאה ביצירת השותף'; },
    });
  }

  // ── Delete Partner (soft delete — same endpoint/pattern as the delete
  // button on the Partner Builder page itself). Type-to-confirm. ──
  deleteTarget: PartnerRow | null = null;
  deleteConfirmText = '';
  isDeleting = false;
  deleteError = '';

  get deleteConfirmValid(): boolean {
    return !!this.deleteTarget && this.deleteConfirmText.trim() === this.deleteTarget.display_name.trim();
  }

  openDeleteModal(p: PartnerRow): void {
    this.deleteTarget = p;
    this.deleteConfirmText = '';
    this.deleteError = '';
  }

  closeDeleteModal(): void {
    this.deleteTarget = null;
  }

  confirmDelete(): void {
    if (!this.deleteConfirmValid || this.isDeleting || !this.deleteTarget) return;
    this.isDeleting = true;
    const id = this.deleteTarget.id;
    this.entitiesService.deleteEntity(id).subscribe({
      next: () => {
        this.isDeleting = false;
        this.partners = this.partners.filter(p => p.id !== id);
        this.deleteTarget = null;
      },
      error: err => {
        this.isDeleting = false;
        this.deleteError = err?.error?.error || 'שגיאה במחיקת השותף';
      },
    });
  }
}
