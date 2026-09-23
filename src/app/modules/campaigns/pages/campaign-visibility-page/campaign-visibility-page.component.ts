import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignWorkspaceContextService } from '../../services/campaign-workspace-context.service';
import {
  CampaignDraft,
  CampaignBlock,
  StatsBlockData,
  StatItem,
  StatKey,
} from '../../services/campaign-studio-state.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

type ContentBlockType = 'sponsors' | 'ambassadors' | 'updates';

// Dedicated page (2026-08-06 architecture reset) — was a Dashboard section
// ("campaign-dashboard-visibility"), promoted to its own page per explicit
// product direction: visibility toggles are Configuration, not something
// managed daily, so they don't belong on the main Overview screen. Same
// underlying fields as before (isHidden / blocks[].visible /
// offeringsEnabled / StatsBlockData.items[].visible), same self-sufficient
// fetch→mutate→save pattern as Settings — no shared
// CampaignStudioStateService dependency.
@Component({
  selector: 'app-campaign-visibility-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-visibility-page.component.html',
  styleUrl: './campaign-visibility-page.component.css',
})
export class CampaignVisibilityPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private ctx = inject(CampaignWorkspaceContextService);
  private loader = inject(AppLoaderService);

  readonly statLabels: Record<StatKey, string> = {
    target: 'יעד הגיוס', raised: 'גויס עד כה', percent: 'אחוז הגיוס',
    supporters: 'תומכים', start_date: 'תחילת הקמפיין',
    end_date: 'תאריך סיום', days_remaining: 'ימים נותרו', ambassadors: 'שגרירים',
  };

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  // Save-state indicator (2026-09-23) -- every control on this page
  // autosaves with zero feedback beforehand, so a manager clicking a toggle
  // had no way to tell "saving" from "saved" from "silently failed" (the
  // is_hidden bug above was the sharpest example: it looked identical to a
  // successful save). Same שומר.../✓ נשמר/error pattern Campaign Settings
  // already uses -- reused here rather than inventing a new one.
  saving = false;
  saved = false;
  saveError: string | null = null;

  get isOngoing(): boolean { return this.draft?.campaignLifecycle === 'ongoing'; }

  ngOnInit(): void {
    this.loader.hide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.campaignId) { this.loading = false; return; }
    this.ctx.ensureLoaded(this.campaignId).subscribe({
      next: draft => { this.draft = draft; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  // Routed through the dedicated campaignApi.setVisibility() ->
  // PATCH /api/campaigns/:id/visibility (2026-09-23) -- this used to go
  // through the same generic persist()/campaignApi.update() every other
  // toggle on this page uses, but is_hidden is deliberately NOT in the
  // backend's UPDATABLE_CAMPAIGN_COLUMNS whitelist (see campaigns.service.js
  // -- "bypassing every dedicated endpoint (setCampaignVisibility...) that
  // exists specifically to guard those fields"). The generic update silently
  // drops disallowed keys rather than erroring, so this toggle looked like
  // it worked (optimistic UI flip, 200 OK from the rest of the payload) while
  // never actually persisting is_hidden at all. The correct endpoint already
  // existed and was already used correctly by campaigns-page's own list
  // quick-action -- just never wired up here, the one place it's the primary
  // control.
  toggleHidden(): void {
    if (!this.draft) return;
    const previous = this.draft;
    const nextHidden = !this.draft.isHidden;
    const attempted = { ...this.draft, isHidden: nextHidden };
    this.draft = attempted;
    this.saving = true;
    this.saved = false;
    this.saveError = null;
    this.campaignApi.setVisibility(this.campaignId, nextHidden).subscribe({
      next: () => { this.saving = false; this.saved = true; if (this.draft) this.ctx.setDraft(this.draft); },
      error: (err) => {
        // Same optimistic-revert-on-failure guard as persist() below --
        // only revert if nothing newer has since replaced this attempt.
        if (this.draft === attempted) this.draft = previous;
        this.saving = false;
        this.saveError = err?.error?.error || 'השמירה נכשלה — נסה שוב';
      },
    });
  }

  toggleOfferings(): void {
    if (!this.draft) return;
    const previous = this.draft;
    this.draft = { ...this.draft, offeringsEnabled: !this.draft.offeringsEnabled };
    this.persist(previous);
  }

  private findBlock(type: ContentBlockType | 'stats'): CampaignBlock | undefined {
    return this.draft?.blocks?.find(b => b.type === type);
  }

  blockVisible(type: ContentBlockType): boolean | null {
    const block = this.findBlock(type);
    return block ? block.visible !== false : null;
  }

  toggleBlockVisible(type: ContentBlockType): void {
    if (!this.draft) return;
    const previous = this.draft;
    const block = this.findBlock(type);
    if (!block) return;
    const blocks = this.draft.blocks.map(b => b.id === block.id ? { ...b, visible: !b.visible } : b);
    this.draft = { ...this.draft, blocks };
    this.persist(previous);
  }

  get statsBlock(): CampaignBlock | undefined {
    return this.findBlock('stats');
  }

  get statItems(): StatItem[] {
    const block = this.statsBlock;
    if (!block) return [];
    return [...(block.data as StatsBlockData).items].sort((a, b) => a.order - b.order);
  }

  toggleStatItem(key: StatKey): void {
    if (!this.draft) return;
    const previous = this.draft;
    const block = this.statsBlock;
    if (!block) return;
    const data = block.data as StatsBlockData;
    const items = data.items.map(i => i.key === key ? { ...i, visible: !i.visible } : i);
    const blocks = this.draft.blocks.map(b => b.id === block.id ? { ...b, data: { ...data, items } } : b);
    this.draft = { ...this.draft, blocks };
    this.persist(previous);
  }

  private persist(previous: CampaignDraft): void {
    if (!this.draft) return;
    const attempted = this.draft;
    this.saving = true;
    this.saved = false;
    this.saveError = null;
    this.campaignApi.update(this.campaignId, attempted).subscribe({
      next: (updated) => { this.saving = false; this.saved = true; this.ctx.setDraft(updated); },
      error: (err) => {
        // Revert the optimistic toggle so the UI doesn't show an unsaved
        // state as if it had actually saved -- previously this failed
        // silently (bare .subscribe(), no handler at all).
        if (this.draft === attempted) this.draft = previous;
        this.saving = false;
        this.saveError = err?.error?.error || 'השמירה נכשלה — נסה שוב';
      },
    });
  }
}
