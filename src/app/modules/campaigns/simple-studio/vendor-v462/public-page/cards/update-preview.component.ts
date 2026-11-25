import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation } from '@angular/core';
import { CardData } from './card-format';
import { UpdateCardComponent } from './update-card.component';

/**
 * An update card with the update design variables, as the manager's update editor shows it
 * (old core `hamonymUpdatePreviewCard`). The card always carries index 0, as before.
 */
@Component({
  selector: 'div[ham-update-preview]',
  standalone: true,
  imports: [UpdateCardComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'preview ham-manager-card-preview', '[attr.style]': 'vars' },
  template: `<article ham-update-card [item]="item" [cfg]="cfg" [index]="0"></article>`
})
export class UpdatePreviewComponent {
  @Input() item: CardData = {};
  @Input() cfg: CardData = {};

  get vars(): string {
    const c = this.cfg;
    return `--update-card-bg:${c['cardBg'] || '#fff'};--update-title:${c['titleColor'] || '#24463b'};--update-body:${c['textColor'] || '#62746d'};--update-border:${c['borderColor'] || '#e0e8e4'};--update-radius:${Number(c['radius'] ?? 13)}px;--update-title-size:${Number(c['titleSize'] ?? 16)}px;--update-title-weight:${Number(c['titleWeight'] ?? 800)};--update-text-size:${Number(c['textSize'] ?? 13)}px;--update-photo-height:${Number(c['imageHeight'] ?? 135)}px`;
  }
}
