import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CampaignPreviewComponent } from '../../studio/preview/campaign-preview/campaign-preview.component';
import { CampaignStudioStateService, createInitialPartnerDraft } from '../../services/campaign-studio-state.service';
import { EntitiesService } from '../../../../core/services/entities.service';

// Phase 5, Sprint 5.1 — Public Partner Page. Guiding principle (see
// docs/PARTNER_DOMAIN_MODEL_ADR.md "Phase 5"): public pages are Renderers
// only, no business logic. This component does exactly one thing beyond
// rendering — build a CampaignDraft-shaped object so the SAME unmodified
// CampaignPreviewComponent used everywhere else can render it (the same
// small adaptation partner-builder-page.component.ts already does for the
// editor — not new logic, the same pattern reused). No editing capability,
// no CampaignPageBuilderStepComponent import, no authenticated calls at
// all — this must work for a fully anonymous visitor.
@Component({
  selector: 'app-partner-public-page',
  standalone: true,
  imports: [CommonModule, CampaignPreviewComponent],
  templateUrl: './partner-public-page.component.html',
  styleUrl: './partner-public-page.component.css',
})
export class PartnerPublicPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private entitiesService = inject(EntitiesService);
  state = inject(CampaignStudioStateService);

  loading = true;
  loadErrorMessage: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadErrorMessage = 'לא נמצא דף שותף כזה.';
      this.loading = false;
      return;
    }

    this.entitiesService.getPublicPartner(id).subscribe({
      next: partner => {
        const initial = createInitialPartnerDraft(id, partner.displayName || '');
        this.state.loadDraft({
          ...initial,
          campaignLogoUrl: partner.logoUrl,
          blocks: partner.blocks || [],
          layout: { ...initial.layout, ...(partner.layout || {}) },
        });
        this.loading = false;
      },
      error: () => {
        this.loadErrorMessage = 'לא נמצא דף שותף כזה, או שהוא אינו זמין לציבור.';
        this.loading = false;
      },
    });
  }
}
