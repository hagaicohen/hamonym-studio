import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignDraft, Offering } from '../../services/campaign-studio-state.service';
import { UploadService } from '../../../../core/services/upload.service';
import { CampaignPartnersService, CampaignPartner } from '../../services/campaign-partners.service';
import { PartnerLinkModalComponent } from '../../shared/components/partner-link-modal/partner-link-modal.component';
import { CampaignManagementSidebarComponent } from '../../shared/components/campaign-management-sidebar/campaign-management-sidebar.component';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

// Dedicated page (2026-08-06 architecture reset) — CONTENT only: title,
// price, description, stock, image, featured flag, partner link. No
// layout/placement/image-position/color controls — those stayed in the
// Builder's own campaign-offerings-step (Design). Reuses the same
// CampaignPartnersService/PartnerLinkModalComponent the Builder step uses
// for linking (real shared service, not duplicated), but this page always
// operates on an already-saved campaign (reached only from the Dashboard),
// so — unlike the Builder step — there's no "auto-create the campaign
// first" branch to carry over.
@Component({
  selector: 'app-campaign-rewards-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CampaignManagementSidebarComponent, PartnerLinkModalComponent],
  templateUrl: './campaign-rewards-page.component.html',
  styleUrl: './campaign-rewards-page.component.css',
})
export class CampaignRewardsPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private uploadService = inject(UploadService);
  private partnersService = inject(CampaignPartnersService);
  private loader = inject(AppLoaderService);

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;

  campaignPartners: CampaignPartner[] = [];
  linkModalRewardId: string | null = null;
  linkModalRewardTitle = '';

  editingId: string | null = null;
  minimumAmountInput = '250';
  stockInput = '';
  offering: Offering = this.empty();
  isUploadingImage = false;

  // Search (2026-08-07) — client-side title filter over the campaign's own
  // offerings array, same as everything else on this page: no new backend.
  searchTerm = '';

  get isEditing(): boolean { return this.editingId !== null; }
  get isFormValid(): boolean { return !!this.offering.title.trim(); }

  filteredOfferings(draft: CampaignDraft): Offering[] {
    const q = this.searchTerm.trim().toLowerCase();
    if (!q) return draft.offerings;
    return draft.offerings.filter(o => o.title.toLowerCase().includes(q));
  }

  // Carousel (2026-08-07) — same scroll-by-one-card pattern as the public
  // page's own reward slider (campaign-preview.component#scrollSlider),
  // so a campaign with many rewards doesn't turn this into one long list.
  scrollCarousel(el: HTMLElement, dir: 'prev' | 'next'): void {
    const firstCard = el.firstElementChild?.firstElementChild as HTMLElement;
    const cardWidth = firstCard?.getBoundingClientRect().width || el.clientWidth;
    el.scrollBy({ left: dir === 'prev' ? cardWidth : -cardWidth, behavior: 'smooth' });
  }

  ngOnInit(): void {
    this.loader.hide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.campaignId) { this.loading = false; return; }
    this.campaignApi.getById(this.campaignId).subscribe({
      next: draft => {
        this.draft = draft;
        this.loading = false;
        this.partnersService.listForCampaign(this.campaignId).subscribe({
          next: res => { this.campaignPartners = res.partners; },
        });
      },
      error: () => { this.loading = false; },
    });
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  linkedPartnerFor(rewardId: string): CampaignPartner | undefined {
    return this.campaignPartners.find(cp => cp.rewardId === rewardId);
  }

  openPartnerPicker(): void {
    if (!this.isFormValid) return;
    this.commitOfferingToDraft();
    this.linkModalRewardId = this.offering.id;
    this.linkModalRewardTitle = this.offering.title;
  }

  onPartnerLinked(cp: CampaignPartner): void {
    this.campaignPartners = [...this.campaignPartners.filter(x => x.id !== cp.id), cp];
    this.linkModalRewardId = null;
  }

  onLinkModalClosed(): void { this.linkModalRewardId = null; }

  unlinkPartner(cp: CampaignPartner): void {
    this.partnersService.remove(cp.id).subscribe({
      next: () => { this.campaignPartners = this.campaignPartners.filter(x => x.id !== cp.id); },
    });
  }

  save(): void {
    if (!this.isFormValid) return;
    this.commitOfferingToDraft();
    this.reset();
  }

  private commitOfferingToDraft(): void {
    if (!this.draft) return;
    if (this.editingId) {
      const offerings = this.draft.offerings.map(o =>
        o.id === this.editingId ? { ...this.offering, id: this.editingId! } : o
      );
      this.draft = { ...this.draft, offerings };
    } else {
      this.editingId = this.offering.id;
      this.draft = { ...this.draft, offerings: [...this.draft.offerings, { ...this.offering }] };
    }
    this.persist();
  }

  clearForm(): void { this.reset(); }

  editOffering(o: Offering): void {
    this.editingId = o.id;
    this.offering = { ...o };
    this.minimumAmountInput = o.minimumAmount ? o.minimumAmount.toLocaleString('he-IL') : '';
    this.stockInput = o.stock !== null ? String(o.stock) : '';
    setTimeout(() => document.querySelector('.rw-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  deleteOffering(id: string): void {
    if (!this.draft) return;
    if (id === this.editingId) this.reset();
    this.draft = { ...this.draft, offerings: this.draft.offerings.filter(o => o.id !== id) };
    this.persist();
  }

  duplicateOffering(o: Offering): void {
    if (!this.draft) return;
    const copy = { ...o, id: Date.now().toString() };
    const idx = this.draft.offerings.findIndex(x => x.id === o.id);
    const offerings = [...this.draft.offerings];
    offerings.splice(idx + 1, 0, copy);
    this.draft = { ...this.draft, offerings };
    this.persist();
    this.editOffering(copy);
  }

  // Blocks non-digit keys before they land in the field at all — the
  // (input) handlers below still strip on paste/autofill too, but this is
  // what stops a stray letter from ever appearing, same pattern as
  // campaign-basic-step's allowSlugChars().
  allowDigitsOnly(event: KeyboardEvent): void {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
    if (allowed.includes(event.key) || event.ctrlKey || event.metaKey) return;
    if (!/^[0-9]$/.test(event.key)) event.preventDefault();
  }

  onAmountInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    const n = Number(raw || 0);
    this.offering.minimumAmount = n;
    this.minimumAmountInput = n ? n.toLocaleString('he-IL') : '';
  }

  onStockInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    this.stockInput = raw;
    this.offering.stock = raw ? Number(raw) : null;
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    this.isUploadingImage = true;
    this.uploadService.upload(file, 'campaigns/rewards').subscribe({
      next: url => { this.offering.imageUrl = url; this.isUploadingImage = false; },
      error: () => { this.isUploadingImage = false; },
    });
  }

  removeImage(): void { this.offering.imageUrl = null; }

  private empty(): Offering {
    return { id: Date.now().toString(), title: '', description: '', minimumAmount: 250, stock: null, imageUrl: null, featured: false };
  }

  private reset(): void {
    this.editingId = null;
    this.minimumAmountInput = '250';
    this.stockInput = '';
    this.offering = this.empty();
  }

  private persist(): void {
    if (!this.draft) return;
    this.saving = true;
    this.campaignApi.update(this.campaignId, this.draft).subscribe({
      next: () => { this.saving = false; },
      error: () => { this.saving = false; },
    });
  }
}
