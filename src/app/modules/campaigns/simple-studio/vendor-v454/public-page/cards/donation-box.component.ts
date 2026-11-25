import { ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { PagePart, PageValueDirective } from '../parts/page-part';
import { NgTemplateOutlet } from '@angular/common';
import { CardData, asText, money } from './card-format';
import { CardMediaService } from './card-media.service';
import { DonationCarousel, fittedColumns } from './donation-amount-layout';

const LAYOUTS = ['grid', 'list', 'row', 'carousel'];
const SHAPES = ['rounded', 'square', 'pill', 'circle', 'soft', 'outline'];
const DISTRIBUTIONS = ['full', 'justify', 'center', 'right'];
/** Card images: inline images and http(s) only. */
const MEDIA = /^(data:image\/(?:gif|png|jpeg|webp);base64,|https?:\/\/)/i;

interface Amount { index: number; total: string; recurring: boolean; each: string; months: string; label: string; icon: { src: string; size: number } | null; style: string; media: string; }

/**
 * The donation box of the public page (old core `donateBoxMarkup`): suggested amounts as cards
 * (grid, list, row or carousel; plain or "picture + meaning"), "other amount", and continue.
 * Receives `content.donate` already resolved for the current device (the core's
 * `dbStyleForDevice`). The donation handlers act on `[data-donation-choice]`, `[data-donation-other]`,
 * `[data-donation-continue]`; the carousel code fills `.db-carousel-dots` / `.db-carousel-count`.
 */
@Component({
  selector: 'div[ham-donation-box]',
  standalone: true,
  imports: [NgTemplateOutlet, PageValueDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes', '[attr.style]': 'vars', '[attr.data-ham-box-selected]': 'boxSelected' },
  template: `<ng-template #amountList><div #track class="donation-amounts" (keydown)="trackKey($event)" (scroll)="trackScrolled()" [attr.role]="carousel ? 'region' : null" [attr.aria-roledescription]="carousel ? 'קרוסלה' : null" [attr.aria-label]="carousel ? 'סכומי תרומה' : null" [attr.tabindex]="carousel ? '0' : null">@for (a of amounts; track a.index) {
  @if (meaning) {<button type="button" class="donation-amount donation-meaning-card" [class.donation-selected]="isSelected(a.index)" [class.is-chosen]="isSelected(a.index)" [attr.aria-pressed]="pressed(a.index)" [attr.data-donation-choice]="a.index" [attr.style]="a.style"><span class="db-meaning-photo">@if (a.media) {<img [attr.src]="a.media" alt="" loading="lazy">} @else {<span class="db-meaning-placeholder">＋ תמונה</span>}</span><span class="db-meaning-content"><strong>{{ a.total }}</strong><ng-container *ngTemplateOutlet="amountLabel; context: { $implicit: a }" /></span></button>}
  @else {<button type="button" class="donation-amount" [class.has-media]="!!a.media" [class.donation-selected]="isSelected(a.index)" [class.is-chosen]="isSelected(a.index)" [attr.aria-pressed]="pressed(a.index)" [attr.data-donation-choice]="a.index" [attr.style]="a.media ? a.style + 'background-image:linear-gradient(#0005,#0005),url(&quot;' + a.media + '&quot;);' : a.style"><strong>{{ a.total }}</strong><ng-container *ngTemplateOutlet="amountLabel; context: { $implicit: a }" /></button>}
}@if (allowOther && otherStyle === 'card') {<button type="button" class="donation-amount donation-other-card" [class.donation-selected]="isSelected('other')" [class.is-chosen]="isSelected('other')" [attr.aria-pressed]="pressed('other')" data-donation-other aria-label="סכום אחר"><strong>＋</strong><small>סכום אחר</small></button>}</div></ng-template><ng-template #amountLabel let-a>@if (a.recurring) {<small>{{ a.each }} × {{ a.months }} חודשים</small>} @else if (a.label || a.icon) {<small class="db-card-label">@if (a.icon) {<img class="db-custom-label-icon" [attr.src]="a.icon.src" alt="" [attr.style]="'width:' + a.icon.size + 'px;height:' + a.icon.size + 'px'">}{{ a.label }}</small>}</ng-template><h3>{{ donate['boxHeading'] || 'בחרו סכום לתרומה' }}</h3>@if (carousel) {<div class="db-carousel-stage" aria-label="קרוסלת סכומי תרומה"><ng-container *ngTemplateOutlet="amountList" /><button type="button" class="db-carousel-arrow" data-db-carousel-prev aria-label="סכום קודם" title="קודם" [hidden]="arrowsHidden" [disabled]="prevDisabled" (click)="arrow($event, -1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button><button type="button" class="db-carousel-arrow" data-db-carousel-next aria-label="סכום הבא" title="הבא" [hidden]="arrowsHidden" [disabled]="nextDisabled" (click)="arrow($event, 1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button></div><div class="db-carousel-footer" aria-label="ניווט סכומי תרומה" [hidden]="arrowsHidden"><div class="db-carousel-dots" role="group" aria-label="בחירת סכום" (click)="dotClick($event)">@for (n of dots; track n) {<button type="button" [attr.class]="n === current ? 'db-carousel-dot is-active' : 'db-carousel-dot'" [attr.data-db-carousel-dot]="n" [attr.aria-label]="'כרטיס ' + (n + 1)" [attr.aria-current]="n === current ? 'true' : null"></button>}</div><span class="db-carousel-count" aria-live="polite">{{ countText }}</span></div>} @else {<ng-container *ngTemplateOutlet="amountList" />}@if (allowOther && otherStyle === 'button') {<button type="button" class="donation-other" [class.donation-selected]="isSelected('other')" [class.is-chosen]="isSelected('other')" [attr.aria-pressed]="pressed('other')" data-donation-other>＋ סכום אחר</button>}@if (allowOther) {<div class="donation-custom-entry" [hidden]="!entryOpen"><label>סכום לתרומה (₪)<input type="text" inputmode="decimal" data-money="1" placeholder="הקלידו סכום" data-donation-custom-input [hamPageValue]="''"></label></div>}<button type="button" class="donation-continue" data-donation-continue>ממשיכים לתרומה</button><small class="donation-demo-note">הדגמת עיצוב בלבד · אין חיוב בפועל</small>`
})
export class DonationBoxComponent extends PagePart implements OnDestroy {
  private readonly media = inject(CardMediaService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  /** `content.donate`, merged with the current device's overrides. */
  @Input() donate: CardData = {};
  @ViewChild('track') private track?: ElementRef<HTMLElement>;

  private static readonly boxes = new WeakMap<Element, DonationBoxComponent>();
  /** The box rendered at this `.donation-box` element (the page's donation handlers). */
  static of(el: Element | null | undefined): DonationBoxComponent | undefined { return el ? DonationBoxComponent.boxes.get(el) : undefined; }

  /**
   * v4.53 (the donation handlers changed the DOM): the chosen amount (its index, or 'other'), whether a choice was
   * made since the render (every amount then has `aria-pressed`), the "other amount" field shown, and the box's
   * own `data-ham-box-selected` (set by a choice, dropped by choosing it again). A render starts without them.
   */
  selected: string | null = null;
  private touched = false;
  entryOpen = false;
  boxSelected: string | null = null;
  /** The columns that fit the box (`--db-effective-cols`), once measured. */
  private effective: number | null = null;
  /** The carousel: its current card and what its arrows, dots and count show (old `updateUI`). */
  private readonly carouselState = new DonationCarousel();
  private observer?: ResizeObserver;

  constructor() {
    super();
    DonationBoxComponent.boxes.set(this.host.nativeElement, this);
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }

  protected render(): void {
    this.selected = this.boxSelected = null;
    this.touched = this.entryOpen = false;
    this.effective = null;
    this.carouselState.reset();
  }

  isSelected(key: string | number): boolean { return this.selected === String(key); }
  pressed(key: string | number): string | null { return this.touched ? String(this.isSelected(key)) : null; }

  /** A click on an amount (or "other"): it is the choice, and the box keeps it (`data-ham-box-selected`). */
  choose(key: string): void {
    this.selected = this.boxSelected = key;
    this.touched = true;
    this.update();
  }
  /** The chosen amount clicked again: no choice, and the field closes. */
  clear(): void {
    this.selected = this.boxSelected = null;
    this.touched = true;
    this.entryOpen = false;
    this.update();
  }
  /** The preview's handler: "other amount" opens the field, an amount closes it. */
  showEntry(open: boolean): void {
    if (this.entryOpen === open) return;
    this.entryOpen = open;
    this.update();
  }

  /**
   * The page is in `#preview` (v4.48; old core `setupDonationAmountLayouts`): fit the amounts' columns to the box's
   * width (again on every resize), and lay out the carousel. v4.53: called on every render; the box renders it.
   */
  attached(): void {
    if (!this.observer && typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.fit());
      this.observer.observe(this.host.nativeElement);
    }
    this.fit();
  }

  private fit(): void {
    const track = this.track?.nativeElement;
    if (!track) return;
    const n = fittedColumns(this.host.nativeElement, track, this.donate);
    if ((this.effective ?? this.columns) !== n) { this.effective = n; this.carouselState.current = 0; track.scrollLeft = 0; }
    this.updateCarousel();
    this.update();
  }

  private cards(): HTMLElement[] { return Array.from(this.track?.nativeElement.querySelectorAll<HTMLElement>(':scope > .donation-amount') || []); }
  private updateCarousel(): void { if (this.carousel) this.carouselState.update(this.cards().length, Math.max(1, Math.min(this.cards().length, this.effective ?? this.columns))); }

  get arrowsHidden(): boolean { return this.carouselState.hidden; }
  get prevDisabled(): boolean { return this.carouselState.prevDisabled; }
  get nextDisabled(): boolean { return this.carouselState.nextDisabled; }
  get dots(): number[] { return this.carouselState.dots; }
  get current(): number { return this.carouselState.current; }
  get countText(): string { return this.carouselState.count; }

  arrow(e: Event, step: number): void { e.preventDefault(); e.stopPropagation(); this.jump(this.carouselState.current + step); }
  dotClick(e: Event): void {
    const dot = (e.target as Element).closest<HTMLElement>('[data-db-carousel-dot]');
    if (dot) { e.stopPropagation(); this.jump(Number(dot.dataset['dbCarouselDot'])); }
  }
  trackKey(e: KeyboardEvent): void {
    if (!this.carousel || e.target !== this.track?.nativeElement) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.jump(this.carouselState.current + 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); this.jump(this.carouselState.current - 1); }
  }
  private frame = 0;
  trackScrolled(): void {
    if (!this.carousel) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const track = this.track?.nativeElement;
      if (!track) return;
      const right = track.getBoundingClientRect().right, max = this.carouselState.maxIndex;
      let best = this.carouselState.current, nearest = Infinity;
      this.cards().forEach((card, i) => { if (i > max) return; const dist = Math.abs(card.getBoundingClientRect().right - right); if (dist < nearest) { nearest = dist; best = i; } });
      this.carouselState.current = best;
      this.updateCarousel();
      this.update();
    });
  }
  private jump(target: number): void {
    const track = this.track?.nativeElement;
    if (!track) return;
    this.carouselState.current = Math.max(0, Math.min(this.carouselState.maxIndex, target));
    const card = this.cards()[this.carouselState.current];
    if (!card) return;
    const diff = card.getBoundingClientRect().right - track.getBoundingClientRect().right;
    track.scrollBy({ left: diff, behavior: 'smooth' });
    this.updateCarousel();
    this.update();
  }

  private get columns(): number { return Math.max(1, Math.min(5, Number(this.donate['boxColumns']) || 2)); }

  get layout(): string { return LAYOUTS.includes(this.donate['boxLayout']) ? this.donate['boxLayout'] : 'grid'; }
  get carousel(): boolean { return this.layout === 'carousel'; }
  get meaning(): boolean { return this.donate['boxCardPresentation'] === 'meaning'; }
  /** The box has the "other amount" field. */
  get hasEntry(): boolean { return this.allowOther; }
  get allowOther(): boolean { return this.donate['boxAllowOther'] !== false; }
  get otherStyle(): string { return this.donate['boxOtherStyle'] === 'button' ? 'button' : 'card'; }

  get classes(): string {
    const d = this.donate;
    const shape = SHAPES.includes(d['boxShape']) ? d['boxShape'] : 'rounded';
    const distribution = DISTRIBUTIONS.includes(d['boxDistribution']) ? d['boxDistribution'] : 'full';
    return `donation-box donation-${this.layout} donation-${shape} donation-distribute-${distribution}` + (this.meaning ? ' donation-meaning' : '');
  }

  get vars(): string {
    const d = this.donate;
    const columns = Math.max(1, Math.min(5, Number(d['boxColumns']) || 2));
    const gap = Math.max(0, Math.min(30, Number(d['boxGap']) || 9));
    return `--db-cols:${columns};--db-effective-cols:${this.effective ?? columns};--db-gap:${gap}px;--db-card-bg:${d['boxCardBg'] || '#f9fbfa'};--db-card-border:${d['boxCardBorder'] || '#d5e2dc'};`
      + `--db-card-border-width:${Math.max(0, Math.min(8, Number(d['boxCardBorderWidth'] ?? 2)))}px;--db-card-radius:${Math.max(0, Math.min(60, Number(d['boxCardRadius'] ?? 14)))}px;`
      + `--db-card-height:${Math.max(48, Math.min(180, Number(d['boxCardHeight'] ?? 78)))}px;--db-card-font:${Math.max(12, Math.min(36, Number(d['boxCardFontSize'] ?? 19)))}px;`
      + `--db-accent:${d['boxAccent'] || '#246f65'};background:${d['boxBg'] || '#ffffff'};color:${d['boxText'] || '#203a36'}`;
  }

  get amounts(): Amount[] {
    const list: CardData[] = Array.isArray(this.donate['boxAmounts']) ? this.donate['boxAmounts'] : [];
    return list.map((a, index): Amount => {
      const recurring = a['kind'] === 'recurring';
      const total = (Number(a['amount']) || 0) * (recurring ? Math.max(1, Number(a['months']) || 1) : 1);
      const image = String(a['image'] || '').trim();
      // A custom label icon is shown only once its image is available (a pending media ref is not).
      const icon = typeof a['labelIcon'] === 'string' && !!this.media.photo(a['labelIcon'])
        ? { src: this.media.safe(a['labelIcon']), size: Math.max(12, Math.min(64, Number(a['labelIconSize']) || 22)) } : null;
      const style = `--label-color:${/^#[0-9a-f]{6}$/i.test(a['labelColor'] || '') ? a['labelColor'] : '#737e79'};--label-size:${Math.max(9, Math.min(32, Number(a['labelSize']) || 12))}px;--label-weight:${a['labelBold'] ? '700' : '400'};`;
      return { index, total: money(total), recurring, each: money(a['amount']), months: asText(a['months']), label: String(a['label'] || ''), icon, style, media: MEDIA.test(image) ? image : '' };
    });
  }
}
