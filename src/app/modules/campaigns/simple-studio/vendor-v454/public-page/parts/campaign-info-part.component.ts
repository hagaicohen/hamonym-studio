import { ChangeDetectionStrategy, Component, Input, OnDestroy, ViewEncapsulation } from '@angular/core';
import { categoryIconName, solidIcon } from '../../core/category-catalog';
import { CardData } from '../cards/card-format';
import { campaignCountdown } from './part-format';
import { PagePart } from './page-part';

const ALIGNS = ['right', 'left', 'center', 'spread'];

/**
 * The campaign's details strip (old core `renderPreview`, part `campaignInfo`): the campaign manager
 * (not in panorama), the location, the category with its solid icon (the subtopic alone on a phone
 * and in panorama), and the countdown (`[data-campaign-countdown]`, refreshed by the core every minute).
 */
@Component({
  selector: 'section[ham-campaign-info-part]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass("campaignInfo", cls)', 'data-part': 'campaignInfo' },
  template: `<div [attr.class]="'campaign-info info-' + text(ci['layout']) + ' info-align-' + align">@if (showManager) {<div class="info-manager">@if (ci['photo']) {<img class="info-avatar" [attr.src]="photo" alt="תמונת מנהל הקמפיין">} @else {<span class="info-avatar info-placeholder" aria-hidden="true">👤</span>}<div><small>מנהל הקמפיין</small><strong>{{ text(ci['manager']) }}</strong><span>{{ text(ci['role']) }}</span></div></div>}<div class="info-facts">@if (managerFact) {<div class="info-fact ham-manager-fact"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3c0-4 3-6 7-6s7 2 7 6v3"/></svg><span>{{ managerFact }}</span></div>}@if (location) {<div class="info-fact"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>{{ location }}</span></div>}@if (category) {<div class="info-fact campaign-category-fact">@if (icon) {<svg class="solid-category-icon" width="17" height="17" [attr.viewBox]="icon.viewBox" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:middle;flex-shrink:0;fill:currentColor">@for (d of icon.paths; track $index) {<path [attr.d]="d"/>}</svg>}<span>{{ category }}</span></div>}@if (countdown !== null) {<div class="info-fact info-countdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span data-campaign-countdown="true">{{ countdown }}</span></div>}</div></div>`
})
export class CampaignInfoPartComponent extends PagePart implements OnDestroy {
  @Input() cls = '';

  private campaign!: CardData;
  ci!: CardData;
  private mobile = false;
  align = 'right';
  showManager = false;
  photo = '';
  location = '';
  category = '';
  icon: ReturnType<typeof solidIcon> = null;
  /** Desktop panorama (v4.47; old `hamApplyCampaignLayout` added it): the manager, as the first fact. */
  managerFact: string | null = null;
  countdown: string | null = null;

  constructor() { super(); this.render(); this.parts.countdowns.add(this); }
  ngOnDestroy(): void { this.parts.countdowns.delete(this); }

  protected render(): void {
    const campaign = this.campaign = this.parts.campaign;
    const ci = this.ci = campaign['content'].campaignInfo;
    this.mobile = this.parts.device() === 'mobile';
    this.align = ALIGNS.includes(ci['desktopAlign']) ? ci['desktopAlign'] : 'right';
    this.showManager = ci['showManager'] !== false && !!String(ci['manager'] || '').trim() && campaign['template'] !== 'panorama';
    this.photo = this.parts.safe(ci['photo']);
    this.location = ci['showLocation'] && String(ci['location'] || '').trim() ? this.text(ci['location']) : '';
    this.category = this.categoryText();
    this.icon = this.category ? solidIcon(categoryIconName(ci)) : null;
    this.managerFact = this.parts.layout.managerFact;
    this.countdown = ci['showCountdown'] && ci['endAt'] ? campaignCountdown(ci['endAt'], this.mobile) : null;
  }

  /**
   * The core's minute timer (old: it wrote the label's text): the countdown of the campaign's current end date, on
   * the device the preview shows now.
   */
  tick(endAt: unknown, mobile: boolean): void {
    if (this.countdown === null || !endAt) return;
    this.countdown = campaignCountdown(endAt, mobile);
    this.cdr.detectChanges();
  }

  text(v: unknown): string { return String(v ?? ''); }

  /** "קטגוריה · נושא", or the subtopic alone on a phone and in panorama; '' when hidden or "אחר". */
  private categoryText(): string {
    const ci = this.ci;
    if (!ci['showCategory'] || !ci['category'] || ci['category'] === 'אחר') return '';
    if ((this.mobile || this.campaign['template'] === 'panorama') && ci['subcategory']) return this.text(ci['subcategory']);
    return this.text(ci['category']) + (ci['subcategory'] ? ' · ' + this.text(ci['subcategory']) : '');
  }
}
