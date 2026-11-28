import { Router, RouterLink, UrlTree } from '@angular/router';
import { STUDIO_PUBLIC_ACTIONS } from '../../../studio-public-actions';
import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CampaignStateService } from '../../core/campaign-state.service';
import { CardData, asText, money, safeLink, internalCampaignLink } from './card-format';
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
  imports: [NgTemplateOutlet, RouterLink],
  host: { class: 'ambassador-card', '[class.hc-card]': 'collection', '[class.ham-amb-card-v1]': '!!actions && layout !== "list"', '[class.ham-amb-row-v1]': 'layout === "list"', '[attr.data-ham-ambassador-index]': 'indexText' },
  styleUrl: './ambassador-card.component.css',
  template: `@if (layout === 'list') {
    <ng-template #rowAvatar>
      @if (photo) { <img [src]="photo" alt=""> } @else { <span aria-hidden="true">{{ initials }}</span> }
    </ng-template>
    <div class="ham-amb-row-identity">
      @if (cfg['showPhotos'] !== false) {
        @if (publicRoute; as route) {
          <a class="ham-amb-row-avatar" [routerLink]="route" [attr.aria-label]="name"><ng-container *ngTemplateOutlet="rowAvatar" /></a>
        } @else {
          <span class="ham-amb-row-avatar"><ng-container *ngTemplateOutlet="rowAvatar" /></span>
        }
      }
      <div class="ham-amb-row-person">
        @if (publicRoute; as route) {
          <a class="ham-amb-row-name" [routerLink]="route" [title]="name">{{ name }}</a>
        } @else {
          <strong class="ham-amb-row-name" [title]="name">{{ name }}</strong>
        }
        <div class="ham-amb-row-role">שגריר הקמפיין</div>
      </div>
    </div>
    <div class="ham-amb-row-metrics">
      <div class="ham-amb-row-numbers">
        @if (showRaised) { <bdi class="ham-amb-row-amount" dir="ltr">{{ raisedText }}</bdi> }
        @if (showGoal) {
          <span class="ham-amb-row-target">
            @if (goal) { מתוך יעד של <bdi dir="ltr">{{ goalText }}</bdi> } @else { לא הוגדר יעד }
          </span>
        }
      </div>
      @if (publicProgressEnabled && goal > 0) {
        <div class="ham-amb-row-track" role="progressbar" aria-label="התקדמות גיוס"
          aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="rowBar" [attr.aria-valuetext]="rowPercent + '% מהיעד'">
          <div class="ham-amb-row-fill" [style.inline-size.%]="rowBar"></div>
        </div>
        <div class="ham-amb-row-percent">{{ rowPercent }}% מהיעד</div>
      }
    </div>
    <div class="ham-amb-row-actions">
      @if (item['id'] && actions?.donateThroughAmbassador; as donate) {
        <button type="button" class="ham-amb-row-donate" (click)="donate(item['id'], link)">
          <span aria-hidden="true">♡</span> תרמו דרכי
        </button>
      }
      @if (publicRoute; as route) {
        <a class="ham-amb-row-link" [routerLink]="route">לדף השגריר <span aria-hidden="true">←</span></a>
      } @else if (cfg['showLinks'] !== false && link) {
        <a class="ham-amb-row-link" [href]="link">לדף השגריר <span aria-hidden="true">←</span></a>
      }
    </div>
  } @else if (actions) {
    @if (layout === 'leaders' && personal) { <span class="ambassador-rank" title="דירוג לפי תוצאות הגיוס">{{ rank }}</span> }
    <ng-template #identity>
      @if (cfg['showPhotos'] !== false) {
        <span class="ham-amb-card-avatar">
          @if (photo) { <img [src]="photo" alt=""> } @else { <span aria-hidden="true">{{ initials }}</span> }
        </span>
      }
      <strong class="ham-amb-card-name" [title]="name">{{ name }}</strong>
      <span class="ham-amb-card-small">שגריר הקמפיין</span>
    </ng-template>
    @if (publicRoute; as route) {
      <a class="ham-amb-card-identity" [routerLink]="route"><ng-container *ngTemplateOutlet="identity" /></a>
    } @else {
      <div class="ham-amb-card-identity"><ng-container *ngTemplateOutlet="identity" /></div>
    }
    @if (showRaised || showGoal) {
      <div class="ham-amb-card-stats">
        @if (showRaised) {
          <span class="ham-amb-card-small">גויסו עד כה</span>
          <bdi class="ham-amb-card-amount" dir="ltr">{{ raisedText }}</bdi>
        }
        @if (showGoal) {
          <span class="ham-amb-card-small">
            @if (goal) { מתוך יעד של <bdi dir="ltr">{{ goalText }}</bdi> } @else { לא הוגדר יעד }
          </span>
        }
      </div>
    }
    @if (publicProgressEnabled) {
      <div class="ham-amb-card-stats ham-amb-card-progress" [attr.aria-hidden]="goal > 0 ? null : 'true'">
        @if (goal > 0) {
        <div class="ham-amb-card-track" role="progressbar" aria-label="התקדמות ליעד האישי"
             aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="bar" [attr.aria-valuetext]="percent + '% מהיעד'">
          <span class="ham-amb-card-fill" [style.inline-size.%]="bar"></span>
        </div>
        <span class="ham-amb-card-percent">{{ percent }}% מהיעד</span>
        }
      </div>
    }
    <div class="ham-amb-card-actions">
        @if (item['id'] && actions.donateThroughAmbassador) {
          <button type="button" class="ham-amb-card-primary" (click)="actions.donateThroughAmbassador(item['id'], link)">
            <span aria-hidden="true">♡</span> תרמו דרכי
          </button>
        }
        @if (publicRoute; as route) {
          <a class="ham-amb-card-secondary" [routerLink]="route">לדף השגריר <span aria-hidden="true">←</span></a>
        } @else if (cfg['showLinks'] !== false && link) {
          <a class="ham-amb-card-secondary" [href]="link">לדף השגריר <span aria-hidden="true">←</span></a>
        }
    </div>
  } @else {@if (layout === 'leaders' && personal) {<span class="ambassador-rank" title="דירוג לפי תוצאות הגיוס">{{ rank }}</span>}@if (cfg['showPhotos'] !== false) {<div class="ambassador-avatar">@if (internalLink && actions) {<a [routerLink]="internalLink ? link : null" [attr.aria-label]="item['name']"><ng-container *ngTemplateOutlet="avatar" /></a>} @else {<ng-container *ngTemplateOutlet="avatar" />}<ng-template #avatar>@if (item['photo']) {<img [attr.src]="photo" alt="">} @else {<span aria-hidden="true">{{ initial }}</span>}</ng-template></div>}<div class="ambassador-info"><strong>@if (internalLink && actions) {<a [routerLink]="internalLink ? link : null">{{ item['name'] }}</a>} @else { {{ item['name'] || 'שגריר' }} }</strong>@if (showRaised || showGoal) {<span class="ambassador-amount">@if (showRaised) {<b>{{ raisedText }}</b>}@if (showRaised && showGoal && goal) {&ngsp;<span class="ambassador-amount-of">מתוך</span>&ngsp;}@if (showGoal && goal) {<span class="ambassador-amount-goal">{{ goalText }}</span>}</span>}@if (showProgress) {<div class="ambassador-progress" role="img" [attr.aria-label]="percent + '% מהיעד האישי'"><span [attr.style]="'width:' + bar + '%'"></span></div><span class="ambassador-percent">{{ percent }}% מהיעד</span>}</div>@if (cfg['showLinks'] !== false) {@if (link) {<a class="ambassador-profile-link" [href]="link" (click)="navigate($event)" [attr.title]="'מעבר לדף של ' + (item['name'] ?? '')">לדף השגריר <span aria-hidden="true">↖</span></a>} @else {<span class="ambassador-profile-missing" title="אפשר להוסיף קישור אישי בניהול השגרירים">{{ hasAmbassadors ? 'אין קישור אישי' : 'קישור לדף השגריר יופיע כאן' }}</span>}} }`
})
export class AmbassadorCardComponent {
  private readonly router = inject(Router);
  get publicRoute(): UrlTree | null {
    const href = internalCampaignLink(this.item['url']);
    // API slugs in href are already percent-encoded. A RouterLink command
    // string would encode the percent signs again.
    return href ? this.router.parseUrl(href) : null;
  }

  get internalLink(): boolean { return !!internalCampaignLink(this.item['url']); }
  navigate(event: MouseEvent): void {
    if (!this.internalLink || !this.actions || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void this.router.navigateByUrl(this.link);
  }

  readonly actions = inject(STUDIO_PUBLIC_ACTIONS, { optional: true });
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
  get rowPercent(): number { return this.goal ? Number((this.raised / this.goal * 100).toFixed(1)) : 0; }
  get rowBar(): number { return Math.min(100, this.rowPercent); }
  get showRaised(): boolean { return this.personal && this.cfg['showAmounts'] !== false; }
  get showGoal(): boolean { return this.personal && this.cfg['showTargets'] !== false; }
  get showProgress(): boolean { return this.personal && this.cfg['showProgress'] !== false && this.goal > 0; }
  get raisedText(): string { return money(this.raised); }
  get goalText(): string { return money(this.goal); }
  get publicProgressEnabled(): boolean { return this.showRaised && this.showGoal && this.cfg['showProgress'] !== false; }
  get name(): string { return String(this.item['name'] || 'שגריר'); }
  get initials(): string { return this.name.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join(''); }
  get rank(): number { return this.index + 1; }
  get photo(): string { return this.media.safe(this.item['photo']); }
  get initial(): string { return String(this.item['name'] || 'ש').charAt(0); }
  get link(): string { return internalCampaignLink(this.item['url']) || safeLink(this.item['url']); }
  get indexText(): string { return asText(this.item['_i']); }
  get hasAmbassadors(): boolean { return (this.campaignState.current['management']?.modules?.ambassadors?.items || []).length > 0; }
}
