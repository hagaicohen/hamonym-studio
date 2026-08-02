import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CampaignPreviewComponent } from '../../studio/preview/campaign-preview/campaign-preview.component';
import { CampaignBlock, CampaignStudioStateService, createInitialPartnerDraft } from '../../services/campaign-studio-state.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { CampaignPartnersService } from '../../services/campaign-partners.service';
import { CampaignApiService } from '../../services/campaign-api.service';

// Phase 5, Sprint 5.1 — Public Partner Page. Guiding principle (see
// docs/PARTNER_DOMAIN_MODEL_ADR.md "Phase 5"): public pages are Renderers
// only, no business logic. This component does exactly one thing beyond
// rendering — build a CampaignDraft-shaped object so the SAME unmodified
// CampaignPreviewComponent used everywhere else can render it (the same
// small adaptation partner-builder-page.component.ts already does for the
// editor — not new logic, the same pattern reused). No editing capability,
// no CampaignPageBuilderStepComponent import, no authenticated calls at
// all — this must work for a fully anonymous visitor.
//
// Phase 5 model refinement (2026-07-30) — this page now COMPOSES two
// sources when a campaign context is known: the Partner Profile (evergreen
// About/Gallery/Hours/Website, from getPublicPartner) and that specific
// campaign's own "Campaign Participation" content (Campaign Hero, offer/
// coupon, campaign-specific story/CTA — from listPublicForCampaign's
// blocks/layout on the matching row). Top-level draft fields (title,
// coverImageUrl, heroType, etc — the ONE fixed hero section every page has)
// always come from the Partner Profile; Campaign Participation contributes
// additional BLOCKS only, rendered first so a visitor sees "why this
// business is here" before the evergreen "about us" content. Visiting with
// no campaignSlug (Sprint 5.1's original case) composes nothing extra —
// Partner Profile alone, unchanged.
@Component({
  selector: 'app-partner-public-page',
  standalone: true,
  imports: [CommonModule, RouterLink, CampaignPreviewComponent],
  templateUrl: './partner-public-page.component.html',
  styleUrl: './partner-public-page.component.css',
})
export class PartnerPublicPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private entitiesService = inject(EntitiesService);
  private campaignPartnersService = inject(CampaignPartnersService);
  private campaignApiService = inject(CampaignApiService);
  state = inject(CampaignStudioStateService);

  loading = true;
  loadErrorMessage: string | null = null;
  private partnerId = '';

  // True when the logged-in visitor is an editor of this Partner — shows a
  // "back to edit" affordance. Checked via the authenticated, ownership-
  // gated GET /api/entities/:id (same call the Builder itself uses) —
  // never via a URL flag, so it can't be guessed/bookmarked/shared. A
  // stranger (or anonymous visitor) just gets a 403/401 and canEdit stays
  // false, regardless of how they arrived at this URL. Mirrors
  // campaign-public-page.component.ts's canEdit/goToEdit exactly.
  canEdit = false;

  // Sprint 5.2/5.3 — arrive here from a campaign's reward "בשיתוף עם" badge:
  // ?campaignSlug=&campaignTitle= carries the context for a "← חזרה לקמפיין"
  // bar, prev/next navigation among this campaign's other partners, and the
  // Campaign Participation content composition described above.
  campaignSlug: string | null = null;
  campaignTitle = '';
  prevPartner: { id: string; displayName: string } | null = null;
  nextPartner: { id: string; displayName: string } | null = null;

  // Campaign banner (image + title + owning-entity logo) — pulled LIVE from
  // the campaign itself, never copied into campaign_partners.blocks. Every
  // partner in this campaign shows the exact same banner, always current —
  // see the "Partner Model Overview" artifact discussion (2026-08-02).
  campaignCoverImageUrl: string | null = null;
  campaignEntityLogo: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const qp = this.route.snapshot.queryParamMap;
    this.campaignSlug = qp.get('campaignSlug');
    this.campaignTitle = qp.get('campaignTitle') || '';

    if (!id) {
      this.loadErrorMessage = 'לא נמצא דף שותף כזה.';
      this.loading = false;
      return;
    }
    this.partnerId = id;

    if (localStorage.getItem('token')) {
      this.entitiesService.getEntityById(id).subscribe({
        next: () => { this.canEdit = true; },
        error: () => {},
      });
    }

    // campaignLinks/campaign are optional context (breadcrumb + prev/next
    // partner nav, campaign banner) — a Partner page must still render on
    // its own even if that campaign is since unpublished/hidden/not yet
    // approved, so failures there degrade to null instead of failing the
    // whole forkJoin and showing a misleading "partner not found" error.
    forkJoin({
      partner: this.entitiesService.getPublicPartner(id),
      campaignLinks: this.campaignSlug
        ? this.campaignPartnersService.listPublicForCampaign(this.campaignSlug).pipe(catchError(() => of(null)))
        : of(null),
      campaign: this.campaignSlug
        ? this.campaignApiService.getBySlugPublic(this.campaignSlug).pipe(catchError(() => of(null)))
        : of(null),
    }).subscribe({
      next: ({ partner, campaignLinks, campaign }) => {
        if (campaign) {
          this.campaignCoverImageUrl = campaign.coverImageUrl;
          this.campaignEntityLogo = campaign.entityLogo ?? null;
          this.campaignTitle = campaign.title || this.campaignTitle;
        }
        const initial = createInitialPartnerDraft(id, partner.displayName || '');

        let campaignBlocks: CampaignBlock[] = [];
        if (campaignLinks) {
          // Dedupe — the same Partner can sponsor more than one reward in a
          // campaign (one campaign_partners row each), but prev/next steps
          // between distinct businesses, and composition uses just one
          // (the first) row's Campaign Participation content.
          const seen = new Set<string>();
          const ordered = campaignLinks.map(l => l.partner).filter(p => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
          const idx = ordered.findIndex(p => p.id === id);
          if (idx !== -1) {
            this.prevPartner = idx > 0 ? ordered[idx - 1] : null;
            this.nextPartner = idx < ordered.length - 1 ? ordered[idx + 1] : null;
          }
          const matchingLink = campaignLinks.find(l => l.partner.id === id);
          // Namespaced ids — Campaign Participation blocks and Partner
          // Profile blocks are authored independently, so ids could
          // theoretically collide once merged into one array.
          campaignBlocks = (matchingLink?.blocks || []).map((b: CampaignBlock) => ({ ...b, id: 'cp-' + b.id }));
        }

        this.state.loadDraft({
          ...initial,
          campaignLogoUrl: partner.logoUrl,
          blocks: [...campaignBlocks, ...(partner.blocks || [])],
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

  goToEdit(): void {
    this.router.navigate(['/partners', this.partnerId, 'builder']);
  }
}
