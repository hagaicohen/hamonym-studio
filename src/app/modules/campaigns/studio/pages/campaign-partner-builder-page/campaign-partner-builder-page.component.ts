import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, Monitor, Smartphone, Maximize2, Minimize2, ArrowRight } from 'lucide-angular';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { CampaignPreviewComponent } from '../../preview/campaign-preview/campaign-preview.component';
import { CampaignStudioStateService, createInitialCampaignPartnerDraft } from '../../../services/campaign-studio-state.service';
import { CampaignPartnersService } from '../../../services/campaign-partners.service';
import { StudioUiService, DeviceMode } from '../../services/studio-ui.service';

// Phase 5 model refinement (2026-07-30) — "Campaign Participation" Builder.
// Edits ONE campaign_partners row's own blocks/layout (Campaign Hero, offer/
// coupon, campaign-specific story/images, CTA) — the per-campaign layer that
// composes together with the Partner Profile (partner-builder-page.component)
// on the public page. Same minimal host-page pattern as Partner Profile's
// own Builder: reuses CampaignPageBuilderStepComponent/CampaignPreviewComponent
// unmodified, just a different draft source (owner-registry.ts OwnerType
// 'campaign-partner'). See docs/PARTNER_DOMAIN_MODEL_ADR.md.
@Component({
  selector: 'app-campaign-partner-builder-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, CampaignPageBuilderStepComponent, CampaignPreviewComponent],
  templateUrl: './campaign-partner-builder-page.component.html',
  styleUrl: './campaign-partner-builder-page.component.css',
})
export class CampaignPartnerBuilderPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private campaignPartnersService = inject(CampaignPartnersService);
  ui = inject(StudioUiService);
  state = inject(CampaignStudioStateService);

  readonly Monitor = Monitor;
  readonly Smartphone = Smartphone;
  readonly Maximize2 = Maximize2;
  readonly Minimize2 = Minimize2;
  readonly ArrowRight = ArrowRight;

  campaignPartnerId = '';
  partnerEntityId = '';
  partnerDisplayName = '';
  campaignTitle = '';
  campaignSlug = '';

  loading = true;
  saving = false;
  saved = false;
  loadError: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError = 'לא נמצאה השתתפות בקמפיין.';
      this.loading = false;
      return;
    }
    this.campaignPartnerId = id;

    this.campaignPartnersService.getOne(id).subscribe({
      next: row => {
        this.partnerEntityId = row.partner.partnerEntityId;
        this.partnerDisplayName = row.partner.partnerDisplayName;
        this.campaignTitle = row.partner.campaignTitle;
        this.campaignSlug = row.partner.campaignSlug;

        this.campaignPartnersService.getDraft(id).subscribe({
          next: draft => {
            const title = `${this.partnerDisplayName} × ${this.campaignTitle}`;
            const initial = createInitialCampaignPartnerDraft(id, title);
            this.state.loadDraft({ ...initial, blocks: draft.blocks || [], layout: { ...initial.layout, ...(draft.layout || {}) } });
            this.loading = false;
          },
          error: () => { this.loadError = 'לא ניתן היה לטעון את תוכן ההשתתפות.'; this.loading = false; },
        });
      },
      error: () => { this.loadError = 'לא נמצאה השתתפות בקמפיין, או שאין לכם גישה אליה.'; this.loading = false; },
    });
  }

  save(): void {
    this.saving = true;
    this.saved = false;
    this.campaignPartnersService.updateDraft(this.campaignPartnerId, {
      blocks: this.state.draft.blocks,
      layout: this.state.draft.layout,
    }).subscribe({
      next: () => { this.saving = false; this.saved = true; },
      error: () => { this.saving = false; },
    });
  }

  setDevice(mode: DeviceMode): void { this.ui.setDevice(mode); }
  toggleFullscreen(): void { this.ui.setFullscreen(!this.ui.isFullscreen); }

  // ── Draggable editor/preview split — see partner-builder-page.component.ts
  // for the full reasoning (same pattern, duplicated rather than shared —
  // consistent with how save/device/fullscreen are already duplicated
  // between these two host pages). ──
  editorWidth = 480;
  private resizing = false;

  startResize(event: MouseEvent): void {
    this.resizing = true;
    event.preventDefault();
  }

  onResizeMove(event: MouseEvent): void {
    if (!this.resizing) return;
    this.editorWidth = Math.min(900, Math.max(320, window.innerWidth - event.clientX));
  }

  stopResize(): void {
    this.resizing = false;
  }
}
