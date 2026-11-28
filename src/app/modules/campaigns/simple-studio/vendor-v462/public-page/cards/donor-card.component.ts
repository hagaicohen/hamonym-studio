import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, ViewChild, ViewEncapsulation, signal } from '@angular/core';
import { CardData, donationRelativeTime } from './card-format';

/**
 * Options of a donor card (old `HamonymCollection.donorCard` options). The card does not know its
 * host: the public donors block and the manager's donations list render the same card.
 */
export interface DonorCardOptions {
  /** `manager` adds the review attributes (`data-hu-incoming-*`) read by the manager list. */
  context?: 'public' | 'manager';
  index?: unknown;
  showAmount?: boolean;
  anonymousAmountVisible?: boolean;
  showTime?: boolean;
  showAvatar?: boolean;
  showDedication?: boolean;
  /** Manager only: the text the list's search matches. */
  searchable?: string;
}

/** One donation (old core `HamonymCollection.donorCard`). */
@Component({
  selector: 'article[ham-donor-card]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hc-donor-card hc-card hu-donation-card',
    dir: 'rtl',
    '[class.hu-incoming-card]': 'manager',
    '[class.ham-donor-card-v3]': '!manager',
    '[attr.aria-label]': "'תרומה מאת ' + name",
    '[attr.data-hu-incoming-index]': 'manager ? incomingIndex : null',
    '[attr.data-hu-incoming-name]': "manager ? (item['name'] || '') : null",
    '[attr.data-hu-incoming-date]': 'manager ? rawDate : null',
    '[attr.data-hu-incoming-search]': "manager ? (options.searchable || '') : null",
    '[attr.data-hu-incoming-status]': "manager ? 'approved' : null"
  },
  styleUrl: './donor-card.component.css',
  template: `
    @if (manager) {
      <div class="hc-donor-top hu-donation-top">
        <strong class="hc-donor-amount hu-donation-amount">{{ amount }}</strong>
        @if (options.showTime !== false) { <small class="hc-donor-time hu-donation-when" [title]="rawDate">{{ when || item['time'] || 'ללא תאריך' }}</small> }
      </div>
      <strong class="hc-donor-name hu-donation-name" [title]="name">{{ name }}</strong>
      <p class="hc-donor-dedication hu-donation-dedication" [title]="dedication">{{ dedication }}</p>
      <span class="hc-donor-heart hu-donation-heart" aria-hidden="true">♡</span>
    } @else {
      <div class="donor-v3-header">
      <div class="donor-v3-identity">
        @if (options.showAvatar !== false) {
          <span class="donor-v3-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M20 21v-2a7 7 0 0 0-14 0v3"/><circle cx="13" cy="7" r="4"/></svg>
          </span>
        }
        <strong class="donor-v3-name" [title]="name">{{ name }}</strong>
        @if (options.showTime !== false) {
          <time class="donor-v3-time" [title]="rawDate">{{ when || item['time'] || 'ללא תאריך' }}</time>
        }
      </div>
      <div class="donor-v3-via">
        @if (attribution) {
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/></svg>
          <span [title]="attribution">{{ attribution }}</span>
        }
      </div>
      </div>
      <bdi class="donor-v3-amount" dir="ltr">{{ amount }}</bdi>
      <div class="donor-v3-blessing" [class.long]="hasMore()">
        <span #quote class="donor-v3-quote">{{ dedication }}</span>
        @if (hasMore() && dedication) {
          <button type="button" class="donor-v3-more" (click)="fullBlessing.showModal()">קראו עוד<span class="donor-v3-sr"> · {{ name }}</span></button>
        }
      </div>
      <div class="donor-v3-foot" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 20 4 12C-1 6 7 1 12 7c5-6 13-1 8 5Z"/></svg>
      </div>
      <dialog #fullBlessing class="donor-v3-dialog" aria-label="ברכת התורם" dir="rtl">
        <h2>ברכת התורם</h2>
        <p>{{ dedication }}</p>
        <form method="dialog"><button type="submit" autofocus>סגירה</button></form>
      </dialog>
    }
  `
})
export class DonorCardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('quote') private quote?: ElementRef<HTMLElement>;
  readonly hasMore = signal(false);
  private resize?: ResizeObserver;

  ngAfterViewInit(): void {
    const quote = this.quote?.nativeElement;
    if (!quote) return;
    this.resize = new ResizeObserver(() => this.hasMore.set(quote.scrollHeight > 35));
    this.resize.observe(quote);
  }

  ngOnDestroy(): void { this.resize?.disconnect(); }

  @Input() item: CardData = {};
  @Input() options: DonorCardOptions = {};

  get manager(): boolean { return this.options.context === 'manager'; }
  get anonymous(): boolean { return this.item['anonymous'] === true || this.item['isAnonymous'] === true; }
  get attribution(): string {
    const name = typeof this.item['ambassadorName'] === 'string' ? this.item['ambassadorName'].trim() : '';
    return !this.anonymous && name ? 'דרך ' + name : '';
  }
  get name(): string { return this.anonymous ? 'תורם אנונימי' : (this.item['name'] || 'תורם אנונימי'); }
  get rawDate(): string {
    const r = this.item;
    return String(r['donatedAt'] || r['donated_at'] || r['createdAt'] || r['created_at'] || r['timestamp'] || r['date'] || '');
  }
  get when(): string { return donationRelativeTime(this.item); }
  get amount(): string {
    const show = this.options.showAmount !== false && (!this.anonymous || this.options.anonymousAmountVisible !== false);
    return show ? '₪' + (Number(this.item['amount']) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 }) : '';
  }
  get dedication(): string {
    const show = this.options.showDedication !== false && (!this.anonymous || this.item['dedicationPublic'] === true);
    return show ? String(this.item['dedication'] || '') : '';
  }
  get incomingIndex(): string { return String(Number(this.options.index) || 0); }
}
