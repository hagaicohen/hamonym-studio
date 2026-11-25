import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation, inject } from '@angular/core';
import { CampaignStateService } from '../../core/campaign-state.service';
import { CardData, asText, money, safeLink } from './card-format';
import { CardMediaService } from './card-media.service';

/**
 * An ambassador (old core `hamSharedAmbassadorCard`, `HamonymContentCards.ambassadorCard`).
 * Amounts, goal and progress are shown only when the campaign makes them public (`personal`).
 * `data-ham-ambassador-index` is the ambassador's position in the manager list.
 */
@Component({
  selector: 'article[ham-ambassador-card]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ambassador-card', '[class.hc-card]': 'collection', '[attr.data-ham-ambassador-index]': 'indexText' },
  template: `@if (layout === 'leaders' && personal) {<span class="ambassador-rank" title="דירוג לפי תוצאות הגיוס">{{ rank }}</span>}@if (cfg['showPhotos'] !== false) {<div class="ambassador-avatar">@if (item['photo']) {<img [attr.src]="photo" alt="">} @else {<span aria-hidden="true">{{ initial }}</span>}</div>}<div class="ambassador-info"><strong>{{ item['name'] || 'שגריר' }}</strong>@if (showRaised || showGoal) {<span class="ambassador-amount">@if (showRaised) {<b>{{ raisedText }}</b>}@if (showRaised && showGoal && goal) {&ngsp;<span class="ambassador-amount-of">מתוך</span>&ngsp;}@if (showGoal && goal) {<span class="ambassador-amount-goal">{{ goalText }}</span>}</span>}@if (showProgress) {<div class="ambassador-progress" role="img" [attr.aria-label]="percent + '% מהיעד האישי'"><span [attr.style]="'width:' + bar + '%'"></span></div><span class="ambassador-percent">{{ percent }}% מהיעד</span>}</div>@if (cfg['showLinks'] !== false) {@if (link) {<a class="ambassador-profile-link" [attr.href]="link" target="_blank" rel="noopener noreferrer" [attr.title]="'מעבר לדף של ' + (item['name'] ?? '')">לדף השגריר <span aria-hidden="true">↖</span></a>} @else {<span class="ambassador-profile-missing" title="אפשר להוסיף קישור אישי בניהול השגרירים">{{ hasAmbassadors ? 'אין קישור אישי' : 'קישור לדף השגריר יופיע כאן' }}</span>}}`
})
export class AmbassadorCardComponent {
  private readonly campaignState = inject(CampaignStateService);
  private readonly media = inject(CardMediaService);
  @Input() item: CardData = {};
  @Input() cfg: CardData = {};
  /** Position in the shown list (the rank, in the leaders layout). */
  @Input() index = 0;
  @Input() layout = 'cards';
  /** The campaign publishes personal amounts (or shows demo ambassadors). */
  @Input() personal = false;
  @Input() collection = false;

  get goal(): number { return Math.max(0, Number(this.item['target']) || 0); }
  get raised(): number { return Math.max(0, Number(this.item['raised']) || 0); }
  get percent(): number { return this.goal ? Math.round(this.raised / this.goal * 100) : 0; }
  get bar(): number { return Math.min(100, Math.max(0, this.percent)); }
  get showRaised(): boolean { return this.personal && this.cfg['showAmounts'] !== false; }
  get showGoal(): boolean { return this.personal && this.cfg['showTargets'] !== false; }
  get showProgress(): boolean { return this.personal && this.cfg['showProgress'] !== false && this.goal > 0; }
  get raisedText(): string { return money(this.raised); }
  get goalText(): string { return money(this.goal); }
  get rank(): number { return this.index + 1; }
  get photo(): string { return this.media.safe(this.item['photo']); }
  get initial(): string { return String(this.item['name'] || 'ש').charAt(0); }
  get link(): string { return safeLink(this.item['url']); }
  get indexText(): string { return asText(this.item['_i']); }
  get hasAmbassadors(): boolean { return (this.campaignState.current['management']?.modules?.ambassadors?.items || []).length > 0; }
}
