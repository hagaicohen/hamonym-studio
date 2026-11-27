import { DropdownComponent, DropdownOptionComponent } from '../../../../shared/ui/dropdown/dropdown.component';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CampaignPartner, CampaignPartnersService } from '../../services/campaign-partners.service';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignWorkspaceContextService } from '../../services/campaign-workspace-context.service';
import { CampaignDraft, CampaignSponsor } from '../../services/campaign-studio-state.service';
import { UploadService } from '../../../../core/services/upload.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';


import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
// Dedicated page (2026-08-06 architecture reset) — CONTENT only: name,
// logo, link. No placement/sidebar-position control — that stayed in the
// Builder's own campaign-sponsors-step (Design).
@Component({
  selector: 'app-campaign-sponsors-page',
  standalone: true,
  imports: [DropdownComponent, DropdownOptionComponent, RouterLink, HmIconComponent, CommonModule, FormsModule],
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

  private readonly partnerApi = inject(CampaignPartnersService);
  tab: 'partners' | 'sponsors' = 'partners';
  sponsorFormOpen = false;
  partners: CampaignPartner[] = [];
  partnerEdit: CampaignPartner | null = null;
  partnersLoading = true;
  savingPartner = false;
  partnerError = '';

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;
  saveError: string | null = null;
  isUploadingLogo = false;

  editingId: string | null = null;
  search = '';
  sortPartner: 'order' | 'name' = 'order';
  visibilityFilter: 'all' | 'visible' | 'hidden' = 'all';

  get visiblePartnerCount(): number | null {
    return this.partnersLoading || this.partnerError ? null : this.partners.filter(partner => partner.visible).length;
  }

  get shownPartners(): CampaignPartner[] {
    const query = this.search.trim().toLowerCase();
    return this.partners.filter(partner =>
      (!query || [partner.partnerDisplayName, partner.coupon].some(value => value?.toLowerCase().includes(query)))
      && (this.visibilityFilter === 'all' || (this.visibilityFilter === 'visible') === partner.visible))
      .sort((a, b) => this.sortPartner === 'name'
        ? (a.partnerDisplayName || '').localeCompare(b.partnerDisplayName || '', 'he')
        : a.order - b.order);
  }

  shownSponsors(draft: CampaignDraft): CampaignSponsor[] {
    const query = this.search.trim().toLowerCase();
    return draft.sponsors.filter(sponsor => !query || sponsor.name.toLowerCase().includes(query));
  }

  form: { name: string; logoUrl: string; link: string } = { name: '', logoUrl: '', link: '' };

  get isEditing(): boolean { return this.editingId !== null; }

  ngOnInit(): void {
    this.loader.hide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.campaignId) { this.loading = false; return; }
    this.partnerApi.listForCampaign(this.campaignId).subscribe({
      next: response => { this.partners = response.partners; this.partnersLoading = false; },
      error: () => { this.partnerError = 'טעינת שותפים נכשלה'; this.partnersLoading = false; },
    });
    this.ctx.ensureLoaded(this.campaignId).subscribe({
      next: draft => { this.draft = draft; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  hasReward(id: string, draft: CampaignDraft): boolean {
    return draft.offerings.some(reward => reward.id === id);
  }

  openPartnerEdit(partner: CampaignPartner): void {
    this.partnerError = '';
    this.partnerEdit = { ...partner };
  }

  savePartner(row: CampaignPartner): void {
    if (this.savingPartner || !Number.isSafeInteger(row.order)) return;
    this.savingPartner = true;
    this.partnerError = '';
    this.partnerApi.update(row.id, {
      rewardId: row.rewardId, order: row.order, visible: row.visible,
      coupon: row.coupon || null,
    }).subscribe({
      next: ({ partner }) => {
        this.partners = this.partners.map(item => item.id === partner.id ? { ...item, ...partner } : item);
        this.partnerEdit = null;
        this.savingPartner = false;
      },
      error: () => {
        this.partnerError = 'שמירת פרטי השותף נכשלה';
        this.savingPartner = false;
      },
    });
  }

  clearForm(): void {
    this.editingId = null;
    this.form = { name: '', logoUrl: '', link: '' };
  }

  addSponsor(): void {
    this.clearForm();
    this.sponsorFormOpen = true;
  }

  closeSponsorForm(): void {
    if (this.saving || this.isUploadingLogo) return;
    this.sponsorFormOpen = false;
    this.clearForm();
  }

  editSponsor(s: CampaignSponsor): void {
    this.sponsorFormOpen = true;
    this.editingId = s.id;
    this.form = { name: s.name, logoUrl: s.logoUrl ?? '', link: s.link ?? '' };
  }

  save(): void {
    if (!this.draft || this.saving || this.isUploadingLogo || !this.form.name.trim()) return;
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
    this.persist(() => this.closeSponsorForm());
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

  private persist(onSaved?: () => void): void {
    if (!this.draft) return;
    this.saving = true;
    this.saveError = null;
    this.campaignApi.updateWorkspaceFields(this.campaignId, { sponsors: this.draft.sponsors }).subscribe({
      next: (updated) => { this.saving = false; this.draft = updated; this.ctx.setDraft(updated); onSaved?.(); },
      error: (err) => { this.saving = false; this.draft = this.ctx.draft(); this.saveError = err?.error?.error || 'שמירת החסות נכשלה, נסו שוב'; },
    });
  }
}
