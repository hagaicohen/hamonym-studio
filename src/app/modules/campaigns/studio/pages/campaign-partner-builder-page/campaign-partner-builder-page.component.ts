import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, Monitor, Smartphone, Maximize2, Minimize2, ArrowRight, House, Eye, User, Save, Check, LoaderCircle } from 'lucide-angular';
import { CampaignPageBuilderStepComponent } from '../../../builder/steps/campaign-page-builder-step/campaign-page-builder-step.component';
import { CampaignPreviewComponent } from '../../preview/campaign-preview/campaign-preview.component';
import { CampaignStudioStateService, createInitialCampaignPartnerDraft } from '../../../services/campaign-studio-state.service';
import { CampaignPartnersService } from '../../../services/campaign-partners.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { StudioUiService } from '../../services/studio-ui.service';

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
  private campaignApiService = inject(CampaignApiService);
  ui = inject(StudioUiService);
  state = inject(CampaignStudioStateService);

  readonly Monitor = Monitor;
  readonly Smartphone = Smartphone;
  readonly Maximize2 = Maximize2;
  readonly Minimize2 = Minimize2;
  readonly ArrowRight = ArrowRight;
  readonly House = House;
  readonly Eye = Eye;
  readonly User = User;
  readonly Save = Save;
  readonly Check = Check;
  readonly LoaderCircle = LoaderCircle;

  campaignPartnerId = '';
  partnerEntityId = '';
  partnerDisplayName = '';
  campaignTitle = '';
  campaignSlug = '';

  // Live campaign banner, same as partner-public-page.component.ts — shown
  // in the preview pane so the manager sees exactly what donors will see,
  // without needing to open the composed public page separately.
  campaignCoverImageUrl: string | null = null;
  campaignEntityLogo: string | null = null;

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

        if (this.campaignSlug) {
          this.campaignApiService.getBySlugPublic(this.campaignSlug).subscribe({
            next: campaign => {
              this.campaignCoverImageUrl = campaign.coverImageUrl;
              this.campaignEntityLogo = campaign.entityLogo ?? null;
            },
            error: () => {},
          });
        }

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
}
