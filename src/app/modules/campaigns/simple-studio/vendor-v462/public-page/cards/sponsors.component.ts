import { PagePart } from '../parts/page-part';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { CampaignStateService } from '../../core/campaign-state.service';
import { Campaign } from '../../core/campaign-defaults';
import { CardData } from './card-format';
import { CardMediaService } from './card-media.service';

/** Sponsors with a logo, in the order of the manager (old core `sponsorMarkup`). */
export function sponsorLogos(campaign: Campaign): CardData[] {
  const mod = campaign['management']?.modules?.sponsors || {};
  return (Array.isArray(mod.items) ? mod.items as CardData[] : []).filter(item => String(item['logo'] || '').trim());
}

/** Whether the public page shows the sponsors strip (hidden, or no logo: nothing at all). */
export function sponsorsShown(campaign: Campaign): boolean {
  return campaign['visible']?.sponsors !== false && sponsorLogos(campaign).length > 0;
}

/**
 * The sponsors strip of the public page (old core `sponsorMarkup`): logos in a moving track,
 * repeated once (hidden from assistive technology) so the marquee loops. Reads the sponsors
 * from the campaign; `data-ham-sponsor-media` is read by the media service.
 */
@Component({
  selector: 'section[ham-sponsors]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ham-sponsors-marquee', dir: 'rtl', 'aria-label': 'חסויות' },
  template: `<h2>חסויות</h2><div class="ham-sponsors-window"><div class="ham-sponsors-track" [class.is-moving]="moving" [class.is-static]="!moving"><div class="ham-sponsors-group">@for (s of logos; track $index) {<div class="ham-sponsor-logo"><img [attr.data-ham-sponsor-media]="s.src" [attr.src]="s.src" [attr.alt]="s.name || 'לוגו נותן חסות'" loading="lazy"></div>}</div>@if (moving) {<div class="ham-sponsors-group" aria-hidden="true">@for (s of logos; track $index) {<div class="ham-sponsor-logo" aria-hidden="true"><img [attr.data-ham-sponsor-media]="s.src" [attr.src]="s.src" alt="" loading="lazy"></div>}</div>}</div></div>`
})
export class SponsorsComponent extends PagePart {
  private readonly campaignState = inject(CampaignStateService);
  private readonly media = inject(CardMediaService);
  logos: { src: string; name: unknown }[] = [];
  moving = false;
  constructor() { super(); this.render(); }
  /** The campaign's sponsors (v4.53: again on each page render). */
  protected render(): void {
    this.logos = sponsorLogos(this.campaignState.current).map(item => ({ src: this.media.safe(item['logo']), name: item['name'] }));
    this.moving = this.logos.length > 1;
  }
}
