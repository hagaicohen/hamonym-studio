import { RewardResponsibilityNoticeComponent } from '../../../../shared/components/reward-responsibility-notice/reward-responsibility-notice.component';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, Renderer2, ViewEncapsulation, inject, untracked } from '@angular/core';
import { CartStoreService } from '../../cart/cart-store.service';
import { CardData, asText, money } from './card-format';
import { CardMediaService } from './card-media.service';

/**
 * Reward card of the public page (old core `rewardTileMarkup`). Used in the rewards collection,
 * the desktop sidebar list, and scaled down in the manager. `[data-donate]` on its button and
 * `data-reward-index` are read by the document handlers (cart, reward dialog).
 */
@Component({
  selector: 'article[ham-reward-tile]',
  standalone: true,
  imports: [RewardResponsibilityNoticeComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'reward-tile',
    '[class.reward-sold-out]': 'soldOut',
    '[class.reward-featured]': 'featured',
    '[class.hc-card]': 'collection',
    '[attr.data-reward-index]': 'indexText'
  },
  template: `@if (featured) {<span class="reward-featured-badge" aria-label="תשורה מומלצת" title="תשורה מומלצת"><span class="reward-featured-star" aria-hidden="true">★</span></span>}<span class="ham-reward-selected-mark" aria-label="תשורה נבחרה" title="התשורה נבחרה" [hidden]="!selected">✓</span>@if (showImages) {<div class="reward-tile-photo">@if (photo) {<img [attr.src]="photo" [attr.alt]="item['name'] ?? ''" loading="lazy">} @else {<div class="reward-photo-placeholder" aria-hidden="true">◇</div>}</div>}<div class="reward-tile-copy"><div class="reward-tile-price">{{ price }}</div><strong>{{ item['name'] || 'שם התשורה' }}</strong>@if (cfg['showDescriptions'] !== false && item['description']) {<p>{{ item['description'] }}</p>}@if (cfg['showAvailability'] !== false && item['stockEnabled']) {<small class="reward-availability" [class.is-out]="soldOut">{{ soldOut ? 'אזל מהמלאי' : 'נותרו ' + left + ' יחידות' }}</small>}<button type="button" [attr.disabled]="soldOut ? '' : null" [attr.aria-disabled]="soldOut ? 'true' : null" [attr.data-donate]="soldOut ? null : 'true'" [attr.aria-pressed]="!soldOut && synced ? String(selected) : null">{{ soldOut ? 'אזל' : selected ? 'ביטול בחירה' : 'בחירת תשורה' }}</button><app-reward-responsibility-notice /></div>`
})
export class RewardTileComponent implements OnInit, OnDestroy {
  private readonly media = inject(CardMediaService);
  @Input() item: CardData = {};
  @Input() cfg: CardData = {};
  /** `data-reward-index` (the core defaulted a missing index to 0). */
  @Input() index: unknown = 0;
  /** Inside a public collection: the card also carries `hc-card`. */
  @Input() collection = false;
  /**
   * On the page (v4.51): the tile shows whether the reward is in the cart (`ham-reward-is-selected`, the mark, the
   * button's text and `aria-pressed`) once the cart has synced the tiles after this one was rendered
   * (CartStoreService `syncTiles`, which asks every live tile to `refresh`). The manager's previews and the markup
   * globals are not live.
   */
  @Input() live = false;
  private readonly cart = inject(CartStoreService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly rendered = untracked(() => this.cart.tileSync());
  readonly String = String;

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly renderer = inject(Renderer2);

  ngOnInit(): void { if (this.live) this.cart.addTile(this); }
  ngOnDestroy(): void { this.cart.removeTile(this); }
  /** A cart sync (CartStoreService `syncTiles`): the selected class on the host, and this template. */
  refresh(): void {
    if (this.selected) this.renderer.addClass(this.host, 'ham-reward-is-selected'); else this.renderer.removeClass(this.host, 'ham-reward-is-selected');
    this.cdr.detectChanges();
  }
  get synced(): boolean { return this.live && this.cart.tileSync() > this.rendered; }
  get selected(): boolean { return this.synced && this.cart.selectedRewards().has(Number(this.indexText)); }

  get soldOut(): boolean { return !!this.item['stockEnabled'] && Number(this.item['quantity'] || 0) <= 0; }
  get featured(): boolean { return !!this.item['recommended']; }
  get showImages(): boolean { return this.cfg['showImages'] !== false; }
  get photo(): string { return this.media.photo(this.item['image']); }
  get price(): string { return money(this.item['amount']); }
  get left(): number { return Math.max(0, Number(this.item['quantity']) || 0); }
  get indexText(): string { return asText(this.index === undefined ? 0 : this.index); }
}
