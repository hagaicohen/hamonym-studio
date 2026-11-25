import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation, inject } from '@angular/core';
import { Json, ManagementModelService } from '../management-model.service';
import { CampaignStateService } from '../../core/campaign-state.service';
import { RewardTileComponent } from '../../public-page/cards/reward-tile.component';
import { contentContext } from './content-context';

/**
 * The public reward card, scaled down, in a reward editor (old `rewardMiniMarkup`). The card is
 * inert: its CTA must not act inside the manager; a click opens the full-size preview
 * (`[data-hu-reward-expand]`, RewardPreviewService). Mounted into `[data-hu-reward-preview]`, which
 * is rewritten while the reward is typed (ManagementInputService).
 */
@Component({
  selector: 'div[ham-reward-mini]',
  standalone: true,
  imports: [RewardTileComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hu-reward-real-mini', role: 'button', tabindex: '0', title: 'לחצו להגדלה',
    '[attr.data-hu-reward-expand]': 'index',
    '[attr.aria-label]': "'הגדל תצוגה מקדימה של ' + (item['name'] || 'תשורה חדשה')"
  },
  template: `<div class="hu-reward-real-mini-visual"><div class="preview hu-reward-real-mini-canvas" dir="rtl" [attr.style]="vars" inert><div class="reward-tiles hu-reward-real-mini-grid"><article ham-reward-tile [item]="item" [cfg]="cfg" [index]="index"></article></div></div></div><span class="hu-reward-real-mini-expand">הגדל תצוגה <span aria-hidden="true">↗</span></span>`
})
export class RewardMiniComponent {
  private readonly model = inject(ManagementModelService);
  private readonly campaignState = inject(CampaignStateService);
  @Input() item: Json = {};
  @Input() index = 0;

  get cfg(): Json { return this.campaignState.current['content'].rewards || {}; }

  /** The reward design variables, at the card's real mobile width, zoomed to fit the editor. */
  get vars(): string {
    const ctx = contentContext(this.model.context), cfg = this.cfg;
    const realWidth = Math.max(170, Math.min(440, Number(ctx.hamCardSizeFor('rewards', 'mobile').width) || 266));
    const scale = Math.min(1, 214 / realWidth);
    return ctx.rewardStyleVars(cfg) + ctx.hamCardSizeVars('rewards', 'mobile') +
      `--reward-bg:${cfg['cardBg'] || '#ffffff'};--reward-accent:${cfg['accentColor'] || this.campaignState.current['theme'].primary};` +
      `--ham-reward-real-width:${realWidth}px;--ham-reward-mini-zoom:${scale};`;
  }
}
