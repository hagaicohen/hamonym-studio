import { DropdownComponent, DropdownOptionComponent } from '../../../../shared/ui/dropdown/dropdown.component';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MoneyInputDirective } from '../../../../shared/directives/money-input.directive';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignWorkspaceContextService } from '../../services/campaign-workspace-context.service';
import { CampaignDraft, Offering } from '../../services/campaign-studio-state.service';
import { UploadService } from '../../../../core/services/upload.service';
import { CampaignPartnersService, CampaignPartner } from '../../services/campaign-partners.service';
import { PartnerLinkModalComponent } from '../../shared/components/partner-link-modal/partner-link-modal.component';
import { AppLoaderService } from '../../../../core/services/app-loader.service';


import { DonationsPageComponent } from '../../../donations/pages/donations-page/donations-page.component';
import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
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
  imports: [DropdownComponent, DropdownOptionComponent, MoneyInputDirective, DonationsPageComponent, RouterLink, HmIconComponent, CommonModule, FormsModule, PartnerLinkModalComponent],
  templateUrl: './campaign-rewards-page.component.html',
  styleUrl: './campaign-rewards-page.component.css',
})
export class CampaignRewardsPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private ctx = inject(CampaignWorkspaceContextService);
  private uploadService = inject(UploadService);
  private partnersService = inject(CampaignPartnersService);
  private loader = inject(AppLoaderService);

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;
  saveError: string | null = null;

  claims: ReadonlyMap<string, number> | null = null;
  claimsError = false;
  campaignPartners: CampaignPartner[] = [];
  linkModalRewardId: string | null = null;
  linkModalRewardTitle = '';

  editingId: string | null = null;
  stockInput = '';
  offering: Offering = this.empty();
  isUploadingImage = false;

  // Search (2026-08-07) — client-side title filter over the campaign's own
  // offerings array, same as everything else on this page: no new backend.
  activeTab: 'catalog' | 'orders' = 'catalog';
  viewMode: 'grid' | 'list' = 'grid';
  formOpen = false;
  stockFilter: 'all' | 'available' | 'unlimited' | 'out' = 'all';
  searchTerm = '';
  page = 0;
  readonly pageSize = 25;

  get featuredCount(): number { return this.draft?.offerings.filter(item => item.featured).length ?? 0; }
  get outOfStockCount(): number | null {
    return this.claims ? this.draft?.offerings.filter(item => this.availableStock(item) === 0).length ?? 0 : null;
  }

  claimed(reward: Offering): number | null {
    return this.claims ? this.claims.get(String(reward.id)) ?? 0 : null;
  }

  availableStock(reward: Offering): number | null {
    const claimed = this.claimed(reward);
    return reward.stock === null || claimed === null ? null : Math.max(0, reward.stock - claimed);
  }

  get isEditing(): boolean { return this.editingId !== null; }
  get isFormValid(): boolean { return !!this.offering.title.trim() && Number.isFinite(this.offering.minimumAmount) && this.offering.minimumAmount >= 0; }

  filteredOfferings(draft: CampaignDraft): Offering[] {
    const q = this.searchTerm.trim().toLowerCase();
    return draft.offerings.filter(reward => {
      const matchesSearch = !q || (reward.title + ' ' + reward.description).toLowerCase().includes(q);
      const matchesStock = this.stockFilter === 'all'
        || (this.stockFilter === 'available' && (this.availableStock(reward) ?? 0) > 0)
        || (this.stockFilter === 'unlimited' && reward.stock === null)
        || (this.stockFilter === 'out' && this.availableStock(reward) === 0);
      return matchesSearch && matchesStock;
    });
  }

  pagedOfferings(draft: CampaignDraft): Offering[] {
    return this.filteredOfferings(draft).slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  ngOnInit(): void {
    this.loader.hide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.campaignId) { this.loading = false; return; }
    this.ctx.ensureLoaded(this.campaignId).subscribe({
      next: draft => {
        this.draft = draft;
        this.loading = false;
        if (draft.entityId) {
          this.campaignApi.getRewardClaims(draft.entityId, this.campaignId).subscribe({
            next: claims => { this.claims = claims; },
            error: () => { this.claimsError = true; },
          });
        }
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
    const { id, title } = this.offering;
    this.commitOfferingToDraft(() => {
      this.linkModalRewardId = id;
      this.linkModalRewardTitle = title;
    });
  }

  onPartnerLinked(cp: CampaignPartner): void {
    this.campaignPartners = [...this.campaignPartners.filter(x => x.id !== cp.id), cp];
    this.linkModalRewardId = null;
  }

  onLinkModalClosed(): void { this.linkModalRewardId = null; }

  unlinkPartner(cp: CampaignPartner): void {
    this.partnersService.remove(cp.id).subscribe({
      next: () => { this.campaignPartners = this.campaignPartners.filter(x => x.id !== cp.id); },
      error: (err) => { this.saveError = err?.error?.error || 'הסרת השיוך לעסק נכשלה, נסו שוב'; },
    });
  }

  save(): void {
    if (!this.isFormValid) return;
    this.commitOfferingToDraft(() => { this.reset(); this.formOpen = false; });
  }

  private commitOfferingToDraft(onSuccess: () => void): void {
    if (!this.draft || this.saving) return;
    if (this.editingId) {
      const offerings = this.draft.offerings.map(o =>
        o.id === this.editingId ? { ...this.offering, id: this.editingId! } : o
      );
      this.draft = { ...this.draft, offerings };
    } else {
      this.editingId = this.offering.id;
      this.draft = { ...this.draft, offerings: [...this.draft.offerings, { ...this.offering }] };
    }
    this.persist(onSuccess);
  }

  clearForm(): void { this.reset(); }

  newOffering(): void {
    this.reset();
    this.formOpen = true;
  }

  closeForm(): void {
    if (this.saving || this.isUploadingImage) return;
    this.reset();
    this.formOpen = false;
  }

  resetView(): void {
    this.page = 0;
  }

  editOffering(o: Offering): void {
    this.editingId = o.id;
    this.offering = { ...o };
    this.stockInput = o.stock !== null ? String(o.stock) : '';
    this.formOpen = true;
  }

  deleteOffering(id: string): void {
    if (!this.draft || this.saving || !confirm('למחוק את התשורה מהקטלוג?')) return;
    if (id === this.editingId) this.reset();
    this.draft = { ...this.draft, offerings: this.draft.offerings.filter(o => o.id !== id) };
    this.persist();
  }

  duplicateOffering(o: Offering): void {
    if (!this.draft || this.saving) return;
    const copy = { ...o, id: crypto.randomUUID() };
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
    return { id: crypto.randomUUID(), title: '', description: '', minimumAmount: 250, stock: null, imageUrl: null, featured: false };
  }

  private reset(): void {
    this.editingId = null;
    this.stockInput = '';
    this.offering = this.empty();
  }

  private persist(onSuccess?: () => void): void {
    if (!this.draft) return;
    this.saving = true;
    this.saveError = null;
    this.campaignApi.updateWorkspaceFields(this.campaignId, { rewards: this.draft.offerings }).subscribe({
      next: (updated) => {
        this.saving = false;
        this.draft = updated;
        this.ctx.setDraft(updated);
        this.page = Math.min(this.page, Math.max(0, Math.ceil(this.filteredOfferings(updated).length / this.pageSize) - 1));
        onSuccess?.();
      },
      error: (err) => {
        this.saving = false;
        this.draft = this.ctx.draft();
        if (!this.draft?.offerings.some(reward => reward.id === this.editingId)) this.editingId = null;
        this.saveError = err?.error?.error || 'שמירת התשורה נכשלה, נסו שוב';
      },
    });
  }
}
