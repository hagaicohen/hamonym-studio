import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { CampaignPartnersService, CampaignPartner } from '../../../services/campaign-partners.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { PartnerImportService, ExtractResult, ClassifyResult, ApplyPayload } from '../../../services/partner-import.service';
import { ResolvedEntry, tierOf, buildProfileDraft, buildParticipationDraft, acceptSuggestion, draftPayload } from '../../../services/partner-import-mapper';
import { CampaignStudioStateService, BlockType } from '../../../services/campaign-studio-state.service';

// Matches CampaignEditorComponent's step order (Basic/Type/Donation/
// Offerings/...) — see campaign-editor.component.ts's imports list.
const OFFERINGS_STEP_INDEX = 4;

interface PartnerResult {
  id: string;
  display_name: string;
  logo_url: string | null;
  website: string | null;
}

// Phase 4 — Partner Management, Epics 1+2+4 (Creation / Discovery / Campaign
// Linking) in one small modal: search existing Partners, or create a new
// one on the spot, then immediately link it to the reward via
// CampaignPartner. See docs/PARTNER_DOMAIN_MODEL_ADR.md §10-11.
@Component({
  selector: 'app-partner-link-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './partner-link-modal.component.html',
  styleUrl: './partner-link-modal.component.css',
})
export class PartnerLinkModalComponent implements OnInit {
  @Input() campaignId!: string;
  @Input() rewardId!: string;
  @Input() rewardTitle = '';
  // Needed only for the 'import' mode's Campaign Participation resolver
  // pass — search/create don't use these at all.
  @Input() campaignTitle = '';
  @Input() campaignShortDescription = '';
  @Output() linked = new EventEmitter<CampaignPartner>();
  @Output() closed = new EventEmitter<void>();

  private entitiesService = inject(EntitiesService);
  private campaignPartnersService = inject(CampaignPartnersService);
  private campaignApiService = inject(CampaignApiService);
  private campaignState = inject(CampaignStudioStateService);
  private partnerImportService = inject(PartnerImportService);
  private router = inject(Router);

  mode: 'search' | 'create' | 'import' = 'search';
  query = '';
  results: PartnerResult[] = [];
  searching = false;
  searched = false;
  linking = false;
  error = '';

  // ── AI Website Import (2026-07-31) — classification-only, see docs/DECISIONS.md ──
  importUrl = '';
  importStep: 'input' | 'review' = 'input';
  extracting = false;
  extractResult: ExtractResult | null = null;
  classifying = false;
  classifyResult: ClassifyResult | null = null;

  importDisplayName = '';
  importContactEmail = '';
  importContactPhone = '';

  private profileBuild: { state: CampaignStudioStateService; table: Record<string, BlockType> } | null = null;
  private participationBuild: { state: CampaignStudioStateService; table: Record<string, BlockType> } | null = null;

  profileAuto: ResolvedEntry[] = [];
  profileReview: ResolvedEntry[] = [];
  profileSuggestions: ResolvedEntry[] = [];
  participationAuto: ResolvedEntry[] = [];
  participationReview: ResolvedEntry[] = [];
  participationSuggestions: ResolvedEntry[] = [];
  acceptedSuggestionIds = new Set<string>();
  private importIdempotencyKey = '';

  ngOnInit(): void {
    this.search();
  }

  search(): void {
    this.searching = true;
    this.entitiesService.searchPartners(this.query).subscribe({
      next: res => { this.results = res.partners; this.searching = false; this.searched = true; },
      error: () => { this.searching = false; this.searched = true; },
    });
  }

  selectExisting(partner: PartnerResult): void {
    this.linking = true;
    this.error = '';
    this.campaignPartnersService.create(this.campaignId, { partnerEntityId: partner.id, rewardId: this.rewardId }).subscribe({
      next: res => { this.linking = false; this.linked.emit(res.partner); },
      error: err => { this.linking = false; this.error = err?.error?.error || 'שגיאה בחיבור השותף'; },
    });
  }

  // §14 — manual Partner creation redirects to the Partners Library instead
  // of creating in-modal (AI Import above stays atomic on purpose — see
  // PARTNER_DOMAIN_MODEL_ADR.md). Saves the campaign first so nothing is
  // lost, then hands off with enough context (?returnCampaignId=&
  // returnRewardId=&returnStep=) for /partners and the Partner Builder to
  // send the manager straight back here, already linked, when they're done.
  creatingRedirect = false;

  goCreateNewPartner(): void {
    if (this.creatingRedirect) return;
    this.creatingRedirect = true;
    this.campaignApiService.update(this.campaignId, this.campaignState.draft).subscribe({
      next: () => {
        this.creatingRedirect = false;
        this.router.navigate(['/partners'], {
          queryParams: {
            returnCampaignId: this.campaignId,
            returnRewardId: this.rewardId,
            returnStep: OFFERINGS_STEP_INDEX,
          },
        });
      },
      error: () => {
        this.creatingRedirect = false;
        this.error = 'שגיאה בשמירת הקמפיין — נסו שוב';
      },
    });
  }

  extractWebsite(): void {
    const url = this.importUrl.trim();
    if (!url) return;
    this.extracting = true;
    this.error = '';
    this.partnerImportService.extract(url).subscribe({
      next: res => {
        this.extracting = false;
        this.extractResult = res;
        this.importDisplayName = res.pageTitle || '';
      },
      error: err => { this.extracting = false; this.error = err?.error?.error || 'שגיאה בשליפת האתר'; },
    });
  }

  continueToClassify(): void {
    if (!this.extractResult) return;
    this.classifying = true;
    this.error = '';
    this.partnerImportService.classify(this.extractResult.sessionId, {
      title: this.campaignTitle, shortDescription: this.campaignShortDescription,
    }).subscribe({
      next: res => {
        this.classifying = false;
        this.classifyResult = res;
        this.importContactEmail = res.contactEmail || '';
        this.importContactPhone = res.contactPhone || '';

        this.profileBuild = buildProfileDraft(res.profile, 'pending', this.importDisplayName || 'שותף');
        this.participationBuild = buildParticipationDraft(res.participation, 'pending', this.campaignTitle || 'השתתפות בקמפיין');

        this.profileAuto = res.profile.filter(e => tierOf(e) === 'auto');
        this.profileReview = res.profile.filter(e => tierOf(e) === 'review');
        this.profileSuggestions = res.profile.filter(e => tierOf(e) === 'suggestion');
        this.participationAuto = res.participation.filter(e => tierOf(e) === 'auto');
        this.participationReview = res.participation.filter(e => tierOf(e) === 'review');
        this.participationSuggestions = res.participation.filter(e => tierOf(e) === 'suggestion');

        this.importStep = 'review';
        // Generated once here, not per submit click — a retry after a
        // network blip must reuse the same key so /apply's dedupe applies.
        this.importIdempotencyKey = crypto.randomUUID();
      },
      error: err => { this.classifying = false; this.error = err?.error?.error || 'שגיאה בסיווג התוכן'; },
    });
  }

  acceptProfileSuggestion(entry: ResolvedEntry): void {
    const key = `profile:${entry.sourceId}`;
    if (!this.profileBuild || this.acceptedSuggestionIds.has(key)) return;
    acceptSuggestion(this.profileBuild.state, entry, this.profileBuild.table);
    this.acceptedSuggestionIds.add(key);
  }

  acceptParticipationSuggestion(entry: ResolvedEntry): void {
    const key = `participation:${entry.sourceId}`;
    if (!this.participationBuild || this.acceptedSuggestionIds.has(key)) return;
    acceptSuggestion(this.participationBuild.state, entry, this.participationBuild.table);
    this.acceptedSuggestionIds.add(key);
  }

  createAndLinkImport(): void {
    if (!this.importDisplayName.trim() || !this.extractResult || !this.classifyResult || !this.profileBuild || !this.participationBuild) return;
    this.linking = true;
    this.error = '';

    const payload: ApplyPayload = {
      idempotencyKey: this.importIdempotencyKey,
      sessionId: this.extractResult.sessionId,
      campaignId: this.campaignId,
      rewardId: this.rewardId,
      displayName: this.importDisplayName.trim(),
      website: this.importUrl.trim() || null,
      contactEmail: this.importContactEmail.trim() || null,
      contactPhone: this.importContactPhone.trim() || null,
      profileDraft: draftPayload(this.profileBuild.state),
      participationDraft: draftPayload(this.participationBuild.state),
      metrics: {
        extractTimeMs: this.extractResult.extractTimeMs,
        classificationTimeMs: this.classifyResult.classificationTimeMs,
        blocksFound: this.classifyResult.profile.length + this.classifyResult.participation.length,
        acceptedAutomatically: this.profileAuto.length + this.participationAuto.length,
        acceptedAfterReview: this.profileReview.length + this.participationReview.length,
        discarded: (this.profileSuggestions.length + this.participationSuggestions.length) - this.acceptedSuggestionIds.size,
      },
    };

    this.partnerImportService.apply(payload).subscribe({
      next: res => { this.linking = false; this.linked.emit(res.campaignPartner); },
      error: err => { this.linking = false; this.error = err?.error?.error || 'שגיאה ביצירה וחיבור השותף'; },
    });
  }

  close(): void { this.closed.emit(); }
}
