import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignWorkspaceContextService } from '../../services/campaign-workspace-context.service';
import { CampaignDraft, CampaignSponsor } from '../../services/campaign-studio-state.service';
import { UploadService } from '../../../../core/services/upload.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

// Dedicated page (2026-08-06 architecture reset) — CONTENT only: name,
// logo, link. No placement/sidebar-position control — that stayed in the
// Builder's own campaign-sponsors-step (Design).
@Component({
  selector: 'app-campaign-sponsors-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-sponsors-page.component.html',
  styleUrl: './campaign-sponsors-page.component.css',
})
export class CampaignSponsorsPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private ctx = inject(CampaignWorkspaceContextService);
  private uploadService = inject(UploadService);
  private loader = inject(AppLoaderService);

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;
  saveError: string | null = null;
  isUploadingLogo = false;

  editingId: string | null = null;
  form: { name: string; logoUrl: string; link: string } = { name: '', logoUrl: '', link: '' };

  get isEditing(): boolean { return this.editingId !== null; }

  ngOnInit(): void {
    this.loader.hide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.campaignId) { this.loading = false; return; }
    this.ctx.ensureLoaded(this.campaignId).subscribe({
      next: draft => { this.draft = draft; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  clearForm(): void {
    this.editingId = null;
    this.form = { name: '', logoUrl: '', link: '' };
  }

  editSponsor(s: CampaignSponsor): void {
    this.editingId = s.id;
    this.form = { name: s.name, logoUrl: s.logoUrl ?? '', link: s.link ?? '' };
  }

  save(): void {
    if (!this.draft || !this.form.name.trim()) return;
    if (this.isEditing) {
      const sponsors = this.draft.sponsors.map(s =>
        s.id === this.editingId
          ? { ...s, name: this.form.name, logoUrl: this.form.logoUrl || null, link: this.form.link || null }
          : s
      );
      this.draft = { ...this.draft, sponsors };
    } else {
      const sponsor: CampaignSponsor = {
        id: Math.random().toString(36).slice(2, 10),
        name: this.form.name,
        logoUrl: this.form.logoUrl || null,
        link: this.form.link || null,
      };
      this.draft = { ...this.draft, sponsors: [...this.draft.sponsors, sponsor] };
    }
    this.persist();
    this.clearForm();
  }

  deleteSponsor(id: string): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, sponsors: this.draft.sponsors.filter(s => s.id !== id) };
    this.persist();
    if (this.editingId === id) this.clearForm();
  }

  onLogoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.isUploadingLogo = true;
    this.uploadService.upload(file, 'campaigns/sponsors').subscribe({
      next: url => { this.form.logoUrl = url; this.isUploadingLogo = false; },
      error: () => { this.isUploadingLogo = false; },
    });
  }

  private persist(): void {
    if (!this.draft) return;
    this.saving = true;
    this.saveError = null;
    this.campaignApi.update(this.campaignId, this.draft).subscribe({
      next: (updated) => { this.saving = false; this.ctx.setDraft(updated); },
      error: (err) => { this.saving = false; this.saveError = err?.error?.error || 'שמירת החסות נכשלה, נסו שוב'; },
    });
  }
}
