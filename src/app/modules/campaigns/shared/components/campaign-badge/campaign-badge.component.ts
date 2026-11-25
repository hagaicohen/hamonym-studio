import { Component, Input } from '@angular/core';
import { HmPublicTextPipe } from '../../../../../core/i18n/content-language';
import { BadgeBlockData, CampaignBlock } from '../../../services/campaign-studio-state.service';

// A promotional badge ("כל תרומה מוכפלת ×2"). Display only: it reads nothing
// from and writes nothing to amounts, charges or reports.
@Component({
  selector: 'app-campaign-badge',
  standalone: true,
  imports: [HmPublicTextPipe],
  template: `
    @if (data.text || data.imageUrl || editing) {
      <div class="bd" [attr.data-shape]="data.shape ?? 'pill'" [attr.data-size]="data.size ?? 'md'"
        [style.--bd-bg]="data.background || campaignColor" [style.--bd-fg]="data.textColor || null" [style.--bd-border]="data.borderColor || null">
        @if (data.imageUrl) { <img class="bd-img" [src]="data.imageUrl" alt=""> }
        <span class="bd-texts">
          <span class="bd-text" [attr.data-inline-edit]="'blocks#' + block.id + '.data.text'" [class.bd-placeholder]="!data.text">{{ data.text || ('publicPage.badge.placeholder' | hmPublic) }}</span>
          @if (data.subtext) { <span class="bd-subtext" [attr.data-inline-edit]="'blocks#' + block.id + '.data.subtext'">{{ data.subtext }}</span> }
        </span>
      </div>
    }
  `,
  styles: [`
    :host { display: flex; padding-block: 8px; padding-inline: clamp(16px, 5vw, 48px); justify-content: var(--bd-justify, center); }
    :host([data-align='start']) { --bd-justify: flex-start; }
    :host([data-align='end']) { --bd-justify: flex-end; }
    .bd {
      display: inline-flex; align-items: center; gap: 10px; max-inline-size: 100%; box-sizing: border-box;
      background: var(--bd-bg); color: var(--bd-fg, #fff); border: 2px solid var(--bd-border, transparent);
      padding: 8px 18px; border-radius: 999px; font-weight: 800; line-height: 1.25;
    }
    .bd[data-shape='ribbon'] { border-radius: 4px; clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 50%, 100% 100%, 0 100%, 12px 50%); padding-inline: 28px; }
    .bd[data-shape='card'] { border-radius: 16px; padding: 14px 20px; }
    .bd[data-size='sm'] { font-size: 14px; } .bd[data-size='md'] { font-size: 18px; } .bd[data-size='lg'] { font-size: 26px; }
    .bd-img { inline-size: 1.8em; block-size: 1.8em; object-fit: contain; flex-shrink: 0; }
    .bd-texts { display: flex; flex-direction: column; min-width: 0; }
    .bd-text { overflow-wrap: anywhere; }
    .bd-subtext { font-size: 0.65em; font-weight: 500; opacity: 0.9; }
    .bd-placeholder { opacity: 0.7; font-style: italic; }
  `],
  host: { '[attr.data-align]': "data.align ?? 'center'" },
})
export class CampaignBadgeComponent {
  @Input({ required: true }) block!: CampaignBlock;
  @Input() campaignColor = '#583cd6';
  @Input() editing = false;
  get data(): BadgeBlockData { return (this.block?.data ?? { text: '' }) as BadgeBlockData; }
}
