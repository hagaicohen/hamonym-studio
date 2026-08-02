import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, Eye, Pencil, Copy, Trash2 } from 'lucide-angular';
import { EntitiesService } from '../../../../core/services/entities.service';
import { defaultPartnerLayoutBlocks } from '../../services/campaign-studio-state.service';
import { PartnerImportService } from '../../services/partner-import.service';
import { CampaignApiService } from '../../services/campaign-api.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

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
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './partners-list-page.component.html',
  styleUrl: './partners-list-page.component.css',
})
export class PartnersListPageComponent implements OnInit {
  // Monochrome, colorable-via-CSS icons (lucide-angular, same system used
  // throughout the Builder topbars) — replaced full-color emoji per explicit
  // feedback: emoji can't be recolored to match a simple gray/purple style.
  readonly Eye = Eye;
  readonly Pencil = Pencil;
  readonly Copy = Copy;
  readonly Trash2 = Trash2;
  private entitiesService = inject(EntitiesService);
  private partnerImportService = inject(PartnerImportService);
  private campaignApiService = inject(CampaignApiService);
  private loader = inject(AppLoaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  partners: PartnerRow[] = [];
  loading = true;

  // Creating a new Partner — three deliberately simple options, no more:
  // duplicate an existing one, clone a URL, or start blank. See
  // DECISIONS.md (2026-08-02).
  createMode: 'choose' | 'duplicate-pick' | 'blank' | 'clone' | null = null;

  // ── Clone from URL — deterministic, no LLM, no review screen. Give a URL,
  // get a finished partner page: literal document-order reproduction,
  // images re-hosted, done. See partner-import.controller.js#clone and
  // deterministic-clone.mapper.js for why this is a different mechanism
  // from the (reviewable, tiered) AI Import used from a campaign's reward-
  // linking flow — that one still exists unchanged, this is a separate,
  // simpler tool for a separate use case.
  cloneUrl = '';
  cloneDisplayName = '';
  cloning = false;
  cloneError = '';

  // Which real campaign (in THIS system) this cloned page is joining —
  // asked up front so the source page's own "לתרומה"/"חזרה לקמפיין"
  // buttons have a real, guaranteed-to-exist destination instead of a
  // best-effort guess (see deterministic-clone.mapper.js). Also creates the
  // real campaign_partners link, same as every other creation path.
  myCampaigns: { id: string; title: string }[] = [];
  loadingCampaigns = false;
  cloneCampaignId = '';

  loadMyCampaigns(): void {
    if (this.myCampaigns.length || this.loadingCampaigns) return;
    this.loadingCampaigns = true;
    this.campaignApiService.list().subscribe({
      next: campaigns => {
        this.myCampaigns = campaigns.map(c => ({ id: c.id!, title: c.title }));
        this.loadingCampaigns = false;
      },
      error: () => { this.loadingCampaigns = false; },
    });
  }

  cloneFromUrl(): void {
    const url = this.cloneUrl.trim();
    if (!url || this.cloning) return;
    this.cloning = true;
    this.cloneError = '';
    // Extraction + image re-hosting can take a while — a full-page spinner
    // (same AppLoaderService every other build-a-page flow uses) is more
    // honest than a static button label for something this slow.
    this.loader.show('בונים את דף השותף...');
    this.partnerImportService.clone(url, this.cloneDisplayName.trim() || undefined, this.cloneCampaignId || undefined).subscribe({
      next: res => {
        this.cloning = false;
        this.loader.hide();
        this.router.navigate(['/partners', res.entity.id, 'builder'], { queryParams: this.returnQueryParams });
      },
      error: err => {
        this.cloning = false;
        this.loader.hide();
        this.cloneError = err?.error?.error || 'שגיאה בבניית הדף מהאתר';
      },
    });
  }

  duplicateSourceId = '';

  newPartner = { display_name: '', website: '', contact_email: '', contact_phone: '' };
  creating = false;
  createError = '';

  // §14 — arrived here mid-campaign-creation via partner-link-modal's
  // "המשך ליצירת שותף" (manual creation redirects to the Library instead of
  // creating in-modal). Carried through to the Partner Builder link/redirect
  // so the manager can get back to the exact reward, already linked.
  returnCampaignId: string | null = null;
  returnRewardId: string | null = null;
  returnStep: string | null = null;

  get returnQueryParams(): Record<string, string> | undefined {
    if (!this.returnCampaignId) return undefined;
    return { returnCampaignId: this.returnCampaignId, returnRewardId: this.returnRewardId ?? '', returnStep: this.returnStep ?? '' };
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.returnCampaignId = qp.get('returnCampaignId');
    this.returnRewardId = qp.get('returnRewardId');
    this.returnStep = qp.get('returnStep');
    if (this.returnCampaignId) this.createMode = 'choose';
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
          next: () => {
            const goToBuilder = () => {
              this.creating = false;
              this.router.navigate(['/partners', entityId, 'builder'], { queryParams: this.returnQueryParams });
            };
            // Seeding the default layout is a convenience, not a
            // correctness requirement — don't block navigation on it.
            this.entitiesService.updateDraft(entityId, { blocks: defaultPartnerLayoutBlocks(), layout: {} }).subscribe({
              next: goToBuilder,
              error: goToBuilder,
            });
          },
          error: () => { this.creating = false; this.createError = 'שגיאה ביצירת השותף'; },
        });
      },
      error: () => { this.creating = false; this.createError = 'שגיאה ביצירת השותף'; },
    });
  }

  // ── Duplicate Partner — "the simple thing": clone an existing Partner's
  // Profile (blocks/layout) verbatim into a brand-new entity, then hand the
  // manager straight to its Builder to rename/adjust. Contact fields
  // (email/phone/website) are deliberately NOT copied — those belong to the
  // new business, not the one being used as a starting point. Blocks are
  // copied as one whole array (internal childBlockIds stay self-consistent)
  // — no id regeneration needed, this entity's blocks are independent of
  // every other entity's. ──
  duplicateTarget: PartnerRow | null = null;
  duplicateName = '';
  duplicating = false;
  duplicateError = '';

  openDuplicateModal(p: PartnerRow): void {
    this.duplicateTarget = p;
    this.duplicateName = `${p.display_name} (עותק)`;
    this.duplicateError = '';
  }

  closeDuplicateModal(): void {
    this.duplicateTarget = null;
  }

  // From the "+ שותף חדש" → "שכפול" picker — same modal as the per-card 🧬
  // button, just choosing the source from a dropdown instead of a click.
  pickDuplicateSource(): void {
    const source = this.partners.find(p => p.id === this.duplicateSourceId);
    if (!source) return;
    this.createMode = null;
    this.openDuplicateModal(source);
  }

  confirmDuplicate(): void {
    if (!this.duplicateTarget || !this.duplicateName.trim() || this.duplicating) return;
    this.duplicating = true;
    this.duplicateError = '';
    const sourceId = this.duplicateTarget.id;

    this.entitiesService.getDraft(sourceId).subscribe({
      next: sourceDraft => {
        this.entitiesService.createEntity({ display_name: this.duplicateName.trim() }).subscribe({
          next: res => {
            const entityId = res.entity.id;
            this.entitiesService.addRole(entityId, 'partner').subscribe({
              next: () => {
                const goToBuilder = () => { this.duplicating = false; this.duplicateTarget = null; this.router.navigate(['/partners', entityId, 'builder']); };
                this.entitiesService.updateDraft(entityId, { blocks: sourceDraft.blocks || [], layout: sourceDraft.layout || {} }).subscribe({
                  next: goToBuilder,
                  error: goToBuilder,
                });
              },
              error: () => { this.duplicating = false; this.duplicateError = 'שגיאה בשכפול השותף'; },
            });
          },
          error: () => { this.duplicating = false; this.duplicateError = 'שגיאה בשכפול השותף'; },
        });
      },
      error: () => { this.duplicating = false; this.duplicateError = 'שגיאה בטעינת הדף לשכפול'; },
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
