import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import {
  CampaignDraft,
  CampaignBlock,
  StatsBlockData,
  StatItem,
  StatKey,
} from '../../services/campaign-studio-state.service';
import { CampaignManagementSidebarComponent } from '../../shared/components/campaign-management-sidebar/campaign-management-sidebar.component';
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
  imports: [CommonModule, CampaignManagementSidebarComponent],
  templateUrl: './campaign-visibility-page.component.html',
  styleUrl: './campaign-visibility-page.component.css',
})
export class CampaignVisibilityPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private loader = inject(AppLoaderService);

  readonly statLabels: Record<StatKey, string> = {
    target: 'יעד הגיוס', raised: 'גויס עד כה', percent: 'אחוז הגיוס',
    supporters: 'תומכים', start_date: 'תחילת הקמפיין',
    end_date: 'תאריך סיום', days_remaining: 'ימים נותרו', ambassadors: 'שגרירים',
  };

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;

  get isOngoing(): boolean { return this.draft?.campaignLifecycle === 'ongoing'; }

  ngOnInit(): void {
    this.loader.hide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.campaignId) { this.loading = false; return; }
    this.campaignApi.getById(this.campaignId).subscribe({
      next: draft => { this.draft = draft; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  toggleHidden(): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, isHidden: !this.draft.isHidden };
    this.persist();
  }

  toggleOfferings(): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, offeringsEnabled: !this.draft.offeringsEnabled };
    this.persist();
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
    const block = this.findBlock(type);
    if (!block) return;
    const blocks = this.draft.blocks.map(b => b.id === block.id ? { ...b, visible: !b.visible } : b);
    this.draft = { ...this.draft, blocks };
    this.persist();
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
    const block = this.statsBlock;
    if (!block) return;
    const data = block.data as StatsBlockData;
    const items = data.items.map(i => i.key === key ? { ...i, visible: !i.visible } : i);
    const blocks = this.draft.blocks.map(b => b.id === block.id ? { ...b, data: { ...data, items } } : b);
    this.draft = { ...this.draft, blocks };
    this.persist();
  }

  private persist(): void {
    if (!this.draft) return;
    this.campaignApi.update(this.campaignId, this.draft).subscribe();
  }
}
