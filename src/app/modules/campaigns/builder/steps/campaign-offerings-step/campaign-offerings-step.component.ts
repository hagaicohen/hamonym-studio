import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Gift, Settings2, ChevronDown, ChevronUp, Eye } from 'lucide-angular';
import { RouterLink } from '@angular/router';
import {
  CampaignStudioStateService,
  Offering,
} from '../../../../campaigns/services/campaign-studio-state.service';
import { ColorPickerComponent } from '../../../../../shared/ui/color-picker/color-picker.component';
import { UploadService } from '../../../../../core/services/upload.service';
import { CampaignPartnersService, CampaignPartner } from '../../../services/campaign-partners.service';
import { PartnerLinkModalComponent } from '../../../shared/components/partner-link-modal/partner-link-modal.component';

@Component({
  selector: 'app-campaign-offerings-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RouterLink, ColorPickerComponent, PartnerLinkModalComponent],
  templateUrl: './campaign-offerings-step.component.html',
  styleUrl: './campaign-offerings-step.component.css',
})
export class CampaignOfferingsStepComponent implements OnInit {
  protected state       = inject(CampaignStudioStateService);
  private uploadService = inject(UploadService);
  private campaignPartnersService = inject(CampaignPartnersService);

  // ── Partner linking (Phase 4 — Partner Management, Epic 4) ──
  // Only meaningful once the campaign has a real id (saved at least once) —
  // CampaignPartner rows reference campaigns.id, which doesn't exist yet for
  // a brand-new unsaved draft.
  campaignPartners: CampaignPartner[] = [];
  linkModalRewardId: string | null = null;
  linkModalRewardTitle = '';

  ngOnInit(): void {
    if (this.draft.id) this.loadCampaignPartners();
  }

  private loadCampaignPartners(): void {
    this.campaignPartnersService.listForCampaign(this.draft.id!).subscribe({
      next: res => { this.campaignPartners = res.partners; },
    });
  }

  linkedPartnerFor(rewardId: string): CampaignPartner | undefined {
    return this.campaignPartners.find(cp => cp.rewardId === rewardId);
  }

  openLinkModal(o: Offering): void {
    this.linkModalRewardId = o.id;
    this.linkModalRewardTitle = o.title;
  }

  onPartnerLinked(cp: CampaignPartner): void {
    this.campaignPartners = [...this.campaignPartners.filter(x => x.id !== cp.id), cp];
    this.linkModalRewardId = null;
  }

  onLinkModalClosed(): void {
    this.linkModalRewardId = null;
  }

  unlinkPartner(cp: CampaignPartner): void {
    this.campaignPartnersService.remove(cp.id).subscribe({
      next: () => { this.campaignPartners = this.campaignPartners.filter(x => x.id !== cp.id); },
    });
  }

  readonly Gift        = Gift;
  readonly Settings2   = Settings2;
  readonly ChevronDown = ChevronDown;
  readonly ChevronUp   = ChevronUp;
  readonly Eye         = Eye;

  // Offering is a pure gift/perk concept again — race/event registration
  // options were pulled out into their own step+model. See DECISIONS.md
  // (2026-07-16). Fixed copy, not preset-driven — every campaign's Offerings
  // step is the same "gifts for donors" concept.
  readonly stepCopy = {
    offeringsStepTitle: 'תשורות',
    offeringsStepSubtitle: 'צור תשורה שתופיע לתורמים בקמפיין שלך',
    offeringsEnableLabel: 'הפעל תשורות לקמפיין',
    offeringsAddButtonLabel: '+ הוסף תשורה חדשה',
  };

  readonly copy = {
    icon: '🎁',
    titleLabel: 'כותרת התשורה',
    descLabel: 'תיאור התשורה',
    priceLabel: 'סכום מינימלי (₪)',
    imageLabel: 'תמונת התשורה',
    featuredTitle: 'תשורה מומלצת',
    featuredDesc: 'תשורות מומלצות יופיעו עם כוכב בולט למבקרים',
    saveBtn: 'שמור תשורה',
    updateBtn: 'עדכן תשורה',
    cta: 'בחירה בתשורה',
  };

  get draft() { return this.state.draft; }

  showAdvanced = false;

  // ── Form state ──
  editingOfferingId: string | null = null;
  minimumAmountInput = '250';
  stockInput = '';
  offering: Offering = this.empty();

  get isEditing(): boolean { return this.editingOfferingId !== null; }

  get isFormValid(): boolean {
    return !!this.offering.title.trim();
  }

  sync(): void { this.state.sync(); }

  // ── Form actions ──
  save(): void {
    if (!this.isFormValid) return;
    if (this.isEditing) {
      const offerings = this.draft.offerings.map(o =>
        o.id === this.editingOfferingId ? { ...this.offering, id: this.editingOfferingId! } : o
      );
      this.state.patch({ offerings });
    } else {
      const offerings = [...this.draft.offerings, { ...this.offering, id: Date.now().toString() }];
      this.state.patch({ offerings });
    }
    this.reset();
  }

  clearForm(): void { this.reset(); }

  editOffering(o: Offering): void {
    this.editingOfferingId = o.id;
    this.offering = { ...o };
    this.minimumAmountInput = o.minimumAmount ? o.minimumAmount.toLocaleString('he-IL') : '';
    this.stockInput = o.stock !== null ? String(o.stock) : '';
    setTimeout(() => document.querySelector('.reward-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  deleteOffering(id: string): void {
    if (id === this.editingOfferingId) this.reset();
    this.state.patch({ offerings: this.draft.offerings.filter(o => o.id !== id) });
  }

  duplicateOffering(o: Offering): void {
    const copy = { ...o, id: Date.now().toString() };
    const idx = this.draft.offerings.findIndex(x => x.id === o.id);
    const offerings = [...this.draft.offerings];
    offerings.splice(idx + 1, 0, copy);
    this.state.patch({ offerings });
    this.editOffering(copy);
  }

  // ── Amount input ──
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

  // ── Image upload ──
  isUploadingImage = false;

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
    this.isUploadingImage = true;
    this.uploadService.upload(file, 'campaigns/rewards').subscribe({
      next: url => { this.offering.imageUrl = url; this.isUploadingImage = false; },
      error: ()  => { this.isUploadingImage = false; },
    });
  }

  removeImage(): void { this.offering.imageUrl = null; }

  // NB: layout.rewardsLayout is the persisted key name (unchanged — see
  // campaign-studio-state.service.ts) even though the method reads "Offerings".
  setOfferingsLayout(layout: 'standard' | 'image'): void {
    this.state.patch({ layout: { ...this.draft.layout, rewardsLayout: layout } });
    this.sync();
  }

  setRewardsImagePosition(position: 'full' | 'inline'): void {
    this.state.patch({ layout: { ...this.draft.layout, rewardsImagePosition: position } });
    this.sync();
  }

  setRewardsImageSize(size: number): void {
    this.state.patch({ layout: { ...this.draft.layout, rewardsImageSize: size } });
    this.sync();
  }

  // ── Theme ──
  patchTheme(partial: Partial<typeof this.draft.layout.theme>): void {
    this.state.patch({
      layout: { ...this.draft.layout, theme: { ...this.draft.layout.theme, ...partial } },
    });
  }

  private empty(): Offering {
    return { id: '', title: '', description: '', minimumAmount: 250, stock: null, imageUrl: null, featured: false };
  }

  private reset(): void {
    this.editingOfferingId = null;
    this.minimumAmountInput = '250';
    this.stockInput = '';
    this.offering = this.empty();
  }
}
