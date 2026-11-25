import { MediaStoreService } from '../../media/media-store.service';
import { ChangeDetectionStrategy, Component, Input, OnInit , inject } from '@angular/core';
import { Json } from '../management-model.service';
import { StaticHtmlDirective } from '../fields';
import { TRASH_ICON, sponsorLiveMarkup } from './content-markup';

/**
 * Full editor of one sponsor (old engine `sponsorManagerForm`, one item). The live preview box is
 * rewritten by the `data-hu-item` handler while typing; logos are stored as data URLs.
 */
@Component({
  selector: 'section[ham-sponsor-editor]',
  standalone: true,
  imports: [StaticHtmlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-sponsor-editor', '[attr.data-hu-collection-index]': 'i' },
  template: `<div class="hu-sponsor-inputs"><div class="hu-reward-editor-header"><strong>חסות {{ i + 1 }}</strong><div class="hu-sponsor-editor-actions"><button type="button" class="hu-action" data-hu-sponsor-move="up" [attr.data-i]="i" [disabled]="i === 0" title="העבר למעלה">↑</button><button type="button" class="hu-action" data-hu-sponsor-move="down" [attr.data-i]="i" [disabled]="i === count - 1" title="העבר למטה">↓</button><button type="button" class="hu-reward-delete" data-hu-remove-item="sponsors" [attr.data-i]="i" title="הסר חסות" aria-label="הסר חסות" [hamStaticHtml]="trash"></button></div></div><div class="hu-fields"><div class="hu-field full"><label>שם החברה / הארגון</label><input type="text" data-hu-item="sponsors" [attr.data-i]="i" data-key="name" [value]="item['name'] || ''" placeholder="שם העסק או הארגון"></div><div class="hu-field full"><label>לוגו החסות</label><div class="hu-reward-photo-upload">@if (logo) {<span class="hu-reward-photo-thumb"><img [attr.data-ham-sponsor-media]="logo" [attr.src]="media.display(logo)" alt=""></span>} @else {<span class="hu-reward-photo-thumb" aria-hidden="true">♧</span>}<label class="hu-reward-file-button" [attr.for]="'hu-sponsor-file-' + i">⬆ העלאת לוגו</label><input [id]="'hu-sponsor-file-' + i" class="hu-visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" [attr.data-hu-sponsor-image]="i">@if (logo) {<button type="button" class="hu-action" [attr.data-hu-sponsor-remove-image]="i">הסר לוגו</button>}</div><small class="hu-hint">JPG / PNG / WebP / SVG, עד 2MB</small></div></div></div><aside class="hu-sponsor-live"><small>תצוגה מקדימה</small><div class="hu-sponsor-manager-preview" [hamStaticHtml]="live"></div></aside>`
})
export class SponsorEditorComponent implements OnInit {
  readonly media = inject(MediaStoreService);
  @Input({ required: true }) item: Json = {};
  @Input({ required: true }) i = 0;
  @Input({ required: true }) count = 0;
  readonly trash = TRASH_ICON;
  logo = '';
  live = '';
  ngOnInit(): void { this.logo = String(this.item['logo'] || ''); this.live = sponsorLiveMarkup(this.item, v => this.media.display(v)); }
}
