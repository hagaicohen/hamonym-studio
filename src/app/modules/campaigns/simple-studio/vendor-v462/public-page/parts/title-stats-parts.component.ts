import { FundraisingMeterComponent } from '../../../../shared/components/fundraising-meter.component';
import { STUDIO_PUBLIC_ACTIONS } from '../../../studio-public-actions';
import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation, inject } from '@angular/core';
import { CardData, asText, money } from '../cards/card-format';
import { StatsCard } from './page-layout';
import { titleDescriptionStyle, titleStyle, titleSubtitleStyle } from './part-format';
import { PagePart } from './page-part';

/**
 * The campaign's title block below the Hero (old core `renderPreview`, part `title`): the title, the
 * short subtitle (hidden on a phone when the manager says so), the manager in the "story" details
 * layout, and the short description.
 */
@Component({
  selector: 'section[ham-title-part]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass("title", cls)', 'data-part': 'title' },
  template: `<div class="title-block" [attr.style]="'text-align:' + text(t['textAlign'] || 'right')"><div class="title-block-inner"><h2 [attr.style]="headingStyle + ';text-align:' + text(t['titleAlign'] || t['textAlign'] || 'right') + '!important'">{{ text(t['title']) }}</h2>@if (showSubtitle) {<p class="campaign-short-subtitle" [attr.style]="subtitleStyle + ';text-align:' + text(t['subtitleAlign'] || t['textAlign'] || 'right') + '!important'">{{ text(t['subtitle']) }}</p>}<div class="campaign-intro-details">@if (showManager) {<div class="intro-manager">@if (ci['photo']) {<img class="info-avatar" [attr.src]="photo" alt="תמונת מנהל הקמפיין">} @else {<span class="info-avatar info-placeholder" aria-hidden="true">👤</span>}<div><small>מנהל הקמפיין</small><strong>{{ text(ci['manager']) }}</strong></div></div>}@if (t['description']) {<p class="campaign-short-description" [attr.style]="descriptionStyle + ';text-align:' + descriptionAlign + '!important;text-align-last:' + descriptionAlign + '!important'">{{ text(t['description']) }}</p>}</div></div></div>`
})
export class TitlePartComponent extends PagePart {
  @Input() cls = '';

  t!: CardData;
  ci!: CardData;
  headingStyle = '';
  subtitleStyle = '';
  descriptionStyle = '';
  descriptionAlign = '';
  showSubtitle = false;
  showManager = false;
  photo = '';

  constructor() { super(); this.render(); }

  protected render(): void {
    const campaign = this.parts.campaign;
    this.t = campaign['content'].title;
    this.ci = campaign['content'].campaignInfo;
    this.headingStyle = titleStyle(this.t);
    this.subtitleStyle = titleSubtitleStyle(this.t);
    this.descriptionStyle = titleDescriptionStyle(this.t);
    this.descriptionAlign = this.text(this.t['descriptionAlign'] || this.t['textAlign'] || 'right');
    this.showSubtitle = !!this.t['subtitle'] && (this.parts.device() !== 'mobile' || this.t['showSubtitleMobile'] !== false);
    this.showManager = this.ci['layout'] === 'story' && !!this.ci['showManager'] && !!campaign['visible'].campaignInfo;
    this.photo = this.parts.safe(this.ci['photo']);
  }

  text(v: unknown): string { return String(v ?? ''); }
}

/**
 * The funding summary (old core `renderPreview`, part `stats`): raised, goal, the progress bar and
 * its percentage, donors and days left, each behind its switch. In the panorama's Hero stats card
 * (the page layout puts this section in the card) it shows the card's content instead.
 */
@Component({
  selector: 'section[ham-stats-part]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass("stats", cls)', 'data-part': 'stats' },
  imports: [FundraisingMeterComponent],
  styles: ['.public-meter-stats{--fundraising-track-size:14px;display:grid;gap:10px;text-align:center}.public-meter-stats .donate-btn{width:100%}'],
  template: `@if (meter) {
    <div class="stats public-meter-stats" [style.--fundraising-accent]="accent">
      @if (s['showRaised'] !== false) { <div class="stats-caption">סך התרומות שגויסו</div> }
      <app-fundraising-meter [raised]="s['raised']" [goal]="s['goal']" [animated]="animate"
        [showRaised]="s['showRaised'] !== false" [showGoal]="s['showGoal'] !== false"
        [showProgress]="s['showProgress'] !== false" />
      @if (meterDetails) { <div class="stats-bottom">{{ meterDetails }}</div> }
      @if (actions && parts.deviceAllowed('donate')) {
        <button type="button" class="donate-btn" (click)="actions.donate()">{{ donateLabel }}</button>
      }
    </div>
  } @else if (card) {@let k = card;@if (k.textOnly) {<div class="ham-cdl-text-stats">@for (m of k.text; track $index) {<div class="ham-cdl-text-item">@if (k.textIcons) {<span class="ham-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">@switch (m.icon) {@case ('days') {<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>}@case ('percent') {<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 7-7"/>}@case ('donors') {<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2"/><circle cx="18" cy="9" r="2"/><path d="M18 14a5 5 0 0 1 4 5"/>}@default {<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>}}</svg></span>}<strong>{{ m.value }}</strong><small>{{ m.label }}</small></div>}</div>} @else {<div class="ham-cdl-main"><div class="ham-cdl-copy">@if (k.caption) {<span class="ham-cdl-kicker">{{ k.caption }}</span>}@if (k.raised) {<strong class="ham-cdl-raised">{{ k.raised }}</strong>}@if (k.goal) {<span class="ham-cdl-target">{{ k.goal }}</span>}</div>@if (k.meter) {<div class="ham-cdl-ring" role="img" [attr.aria-label]="'התקדמות ' + k.meter"><span><b>{{ k.meter }}</b><small>מהיעד</small></span></div>}</div>@if (k.meter) {<div class="ham-cdl-horizontal"><div class="ham-cdl-track"><span [attr.style]="'width:' + k.barWidth"></span></div><b>{{ k.barLabel }}</b></div>}@if (k.donors !== null || k.days !== null) {<div class="ham-cdl-kpis">@if (k.donors !== null) {<div class="ham-cdl-kpi"><span><strong>{{ k.donors }}</strong><small>תורמים</small></span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2"/><circle cx="18" cy="9" r="2"/><path d="M18 14a5 5 0 0 1 4 5"/></svg></div>}@if (k.days !== null) {<div class="ham-cdl-kpi"><span><strong>{{ k.days }}</strong><small>ימים נותרו</small></span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/></svg></div>}</div>}}} @else {<div class="stats"><div class="stats-head"><div>@if (s['showRaised']) {<div class="stats-caption">גויסו עד כה</div><div class="stats-amount">{{ money(s['raised']) }}</div>}</div>@if (s['showGoal']) {<div class="stats-goal">{{ 'מתוך יעד של ' }}<b>{{ money(s['goal']) }}</b></div>}</div>@if (progress) {<div class="progress"><div class="progress-fill" [attr.style]="'width:' + fill + '%'"></div></div>}<div class="stats-bottom">@if (progress) {<b>{{ percent }}% מהיעד</b>}<span>{{ details }}</span></div></div>}`
})
export class StatsPartComponent extends PagePart {
  @Input() cls = '';

  s!: CardData;
  readonly actions = inject(STUDIO_PUBLIC_ACTIONS, { optional: true });
  get meter(): boolean { return this.s[this.device + 'Appearance'] === 'meter'; }
  get animate(): boolean { return this.s[this.device + 'Animate'] !== false; }
  get accent(): string { return this.parts.campaign['theme']?.primary || 'currentColor'; }
  get meterDetails(): string {
    const days = this.s['meterDays'] === undefined ? this.s['days'] : this.s['meterDays'];
    return [
      this.s['showDonors'] !== false ? (this.s['donors'] ?? 0) + ' תורמים' : '',
      this.s['showDays'] !== false && days != null ? days + ' ימים נותרו' : '',
    ].filter(Boolean).join(' · ');
  }
  get donateLabel(): string { return this.parts.campaign['content'].donate?.text || 'תרמו עכשיו'; }
  private get device(): string { return this.parts.device() === 'desktop' ? 'desktop' : 'mobile'; }
  /** In the panorama's Hero stats card (v4.47; old `hamApplyHeroStatsCard` rewrote this section): the card's content. */
  card: StatsCard | null = null;
  readonly money = money;
  /** Percent of the goal raised (core `pct`). */
  percent = 0;
  fill = 0;
  progress = false;
  /** "12 תורמים · 30 ימים נותרו" (the values printed as stored). */
  details = '';

  constructor() { super(); this.render(); }

  protected render(): void {
    const s: CardData = this.s = this.parts.campaign['content'].stats;
    this.card = this.parts.layout.statsCard;
    this.percent = s['goal'] ? Math.round(100 * s['raised'] / s['goal']) : 0;
    this.fill = Math.min(100, Math.max(0, this.percent));
    this.progress = s['showGoal'] !== false && s['showRaised'] !== false && s['showProgress'] !== false;
    this.details = (s['showDonors'] ? `${asText(s['donors'] ?? 0)} תורמים` : '') + (s['showDonors'] && s['showDays'] ? ' · ' : '') + (s['showDays'] ? `${asText(s['days'])} ימים נותרו` : '');
  }
}
