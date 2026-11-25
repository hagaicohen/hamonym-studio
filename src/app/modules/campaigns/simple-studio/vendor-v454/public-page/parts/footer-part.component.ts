import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation } from '@angular/core';
import { hexColor6 } from '../../core/campaign-style';
import { CardData } from '../cards/card-format';
import { PagePart, PageValueDirective } from './page-part';

interface Metric { id: string; value: string; label: string; }
type MediaWindow = Window & { hamonymMediaFix?: { src?(ref: string): string } };

const SOCIAL: [string, string, string][] = [['facebook', 'Facebook', 'f'], ['instagram', 'Instagram', '◎'], ['linkedin', 'LinkedIn', 'in']];
const QUICK_LINKS: [string, string][] = [['donate', 'תרומה'], ['story', 'הסיפור'], ['donors', 'תורמים'], ['rewards', 'תשורות'], ['updates', 'עדכונים'], ['ambassadors', 'שגרירים'], ['races', 'מירוצים']];
/** Only https links are shown. */
const httpsUrl = (value: unknown): string => /^https:\/\//i.test(String(value || '')) ? String(value) : '';

/**
 * The page footer (old core `renderPreview`, part `footer`, rewritten by `hamRenderFooter285` after
 * every render; v4.46 renders the final footer directly): the funding bar, the organization's
 * brand column with its social links, quick links to the blocks, the newsletter form (not connected:
 * it only shows a notice), HAMONYM's contact details and the copyright line. The colors are set on
 * the section (`--ham-footer-*`). The core fills the missing footer settings from the defaults before
 * the page is rendered.
 */
@Component({
  selector: 'section[ham-footer-part]',
  standalone: true,
  imports: [PageValueDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass("footer", cls) + " ham-footer-v285"', 'data-part': 'footer', '[attr.style]': 'vars' },
  template: `@if (show('showBottomBar')) {<div class="ham-footer-bottom-data"><div class="ham-footer-metrics">@for (m of metrics; track m.id) {<div class="ham-footer-metric" [attr.data-metric]="m.id">@if (show('barIcons')) {<span class="ham-footer-metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">@switch (m.id) {
  @case ('days') {<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>}
  @case ('percent') {<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 7-7"/>}
  @case ('donors') {<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2"/><circle cx="18" cy="9" r="2"/><path d="M18 14a5 5 0 0 1 4 5"/>}
  @default {<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>}
}</svg></span>}<strong>{{ m.value }}</strong><small>{{ m.label }}</small></div>}</div></div>}<div class="ham-footer-main"><div class="ham-footer-columns">@if (show('showBrand')) {<div class="ham-footer-col ham-footer-brand">@if (show('showLogo') && logo) {<img class="ham-footer-org-logo" [attr.src]="logo" alt="לוגו העמותה">}@if (brandTitle) {<h3 class="ham-footer-brand-title">{{ brandTitle }}</h3>}@if (brandSubtitle) {<p class="ham-footer-brand-subtitle">{{ brandSubtitle }}</p>}@if (brandBody) {<p class="ham-footer-brand-body">{{ brandBody }}</p>}@if (show('showSocial') && socials.length) {<div class="ham-footer-social">@for (s of socials; track s[0]) {<a [attr.href]="text(f[s[0]])" target="_blank" rel="noopener noreferrer" [attr.aria-label]="s[1]">{{ s[2] }}</a>}</div>}</div>}@if (show('showNavigation')) {<div class="ham-footer-col"><h3>ניווט מהיר</h3><nav class="ham-footer-quick-links" aria-label="ניווט בתחתית הקמפיין">@for (link of quickLinks; track link[0]) {<button type="button" [attr.data-ham-footer-nav]="link[0]" (click)="go($event)">{{ link[1] }}</button>}</nav></div>}@if (show('showNewsletter')) {<div class="ham-footer-col"><h3>הרשמה לעדכונים</h3><p>{{ text(f['newsletterText'] || 'הירשמו לקבלת עדכונים על התקדמות הקמפיין.') }}</p><form class="ham-footer-news-form" (submit)="subscribe($event)"><label class="ham-footer-sr" for="ham-footer-email">כתובת דוא״ל</label><input id="ham-footer-email" type="email" required placeholder="כתובת האימייל שלכם" [hamPageValue]="''"><button type="submit">שלחו</button><small class="ham-footer-news-status" aria-live="polite">{{ newsStatus }}</small></form></div>}@if (show('showContact')) {<div class="ham-footer-col ham-footer-contact"><h3>צור קשר</h3><a href="mailto:info@hamonym.org"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg><span>info&#64;hamonym.org</span></a><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>שעות פעילות: א׳–ה׳ 09:00–17:00</span></span><a href="tel:0723970028"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a16 16 0 0 0 5 5l2-3 5 2v4c0 2-2 3-4 2A22 22 0 0 1 4 7c-1-2 0-4 2-4Z"/></svg><span>072-3970028</span></a></div>}</div><div class="ham-footer-copyright">© {{ year }} {{ organizer }} — כל הזכויות שמורות.</div></div>`
})
export class FooterPartComponent extends PagePart {
  @Input() cls = '';

  private campaign!: CardData;
  private c!: CardData;
  f!: CardData;
  metrics: Metric[] = [];
  socials: typeof SOCIAL = [];
  quickLinks: typeof QUICK_LINKS = [];
  logo = '';
  brandTitle = '';
  brandSubtitle = '';
  brandBody = '';
  organizer = '';
  year = 0;
  vars = '';
  /** The newsletter form's message after a submit (v4.53: the template's; a render shows the form again without it). */
  newsStatus = '';

  constructor() { super(); this.render(); }

  protected render(): void {
    const campaign = this.campaign = this.parts.campaign;
    const c = this.c = campaign['content'];
    const f = this.f = c['footer'] || {};
    this.metrics = this.metricsFor();
    this.socials = SOCIAL.filter(([key]) => httpsUrl(f[key]));
    this.quickLinks = QUICK_LINKS.filter(([id]) => (campaign['visible'] || {})[id] !== false && (id !== 'races' || campaign['management']?.campaignKind === 'race'));
    this.logo = this.logoSrc();
    this.brandTitle = String(f['footerRightTitle'] || c['hero'].title || '').trim();
    this.brandSubtitle = String(f['footerRightSubtitle'] || c['hero'].subtitle || '').trim();
    this.brandBody = String(f['footerRightBody'] || f['brandText'] || '').trim();
    this.organizer = String(campaign['management']?.organizerName || campaign['management']?.organization || '').trim() || 'העמותה';
    this.year = new Date().getFullYear();
    this.vars = this.varsFor();
    this.newsStatus = '';
  }

  show(key: string): boolean { return this.f[key] !== false; }
  text(v: unknown): string { return String(v ?? ''); }

  /** A quick link scrolls to its block, or opens its panorama tab. */
  go(e: Event): void {
    const btn = e.currentTarget as HTMLElement;
    const preview = btn.closest('#preview'), part = btn.dataset['hamFooterNav'];
    const target = (preview?.querySelector(`[data-part="${part}"]`) || preview?.querySelector(`[data-ham-panorama-tab="${part}"]`)) as HTMLElement | null | undefined;
    if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (target.dataset['hamPanoramaTab']) target.click(); }
  }

  /** The newsletter is not connected yet: the form only says so. */
  subscribe(e: Event): void {
    e.preventDefault();
    this.newsStatus = 'הרשמה לעדכונים תחובר למערכת בהמשך; לא נשלח מידע.';
    this.cdr.detectChanges();
  }

  private metricsFor(): Metric[] {
    const st: CardData = this.c['stats'] || {};
    const money = (n: number) => '₪' + Number(n || 0).toLocaleString('en-US');
    const raised = Math.max(0, Number(st['raised']) || 0), goal = Math.max(0, Number(st['goal']) || 0);
    const percentage = goal ? Math.round(raised / goal * 100) : 0;
    const days = Math.max(0, Number(st['days']) || 0), donors = Math.max(0, Number(st['donors']) || 0);
    const all: Metric[] = [{ id: 'days', value: String(days), label: 'ימים נותרו' }, { id: 'percent', value: percentage + '%', label: 'מהיעד' }, { id: 'raised', value: money(raised), label: 'סך גיוס' }, { id: 'donors', value: String(donors), label: 'תורמים' }];
    const stats = this.c['stats'];
    return all.filter(({ id }) => id === 'days' ? stats.showDays !== false : id === 'raised' ? stats.showRaised !== false : id === 'donors' ? stats.showDonors !== false : true);
  }

  /** The Hero logo (resolved when the media service has it; a ref left as is is resolved by the DOM patch). */
  private logoSrc(): string {
    const ref = this.c['hero'].orgLogo;
    const logo = ref ? (window as MediaWindow).hamonymMediaFix?.src?.(ref) || ref : '';
    return /^(https?:|data:image\/|blob:|hamonymmedia:)/i.test(String(logo)) ? String(logo) : '';
  }

  private varsFor(): string {
    const f = this.f, color = hexColor6;
    return `--ham-footer-bg:${color(f['bg'], '#05070e')};--ham-footer-fg:${color(f['textColor'], '#ffffff')};--ham-footer-accent:${color(f['accent'], '#8138ed')};--ham-footer-bar-bg:${color(f['barBg'], '#ffffff')};--ham-footer-bar-color:${color(f['barColor'], '#7432e6')};--ham-footer-label-color:${color(f['barLabelColor'], '#7c8490')};--ham-footer-icon-color:${color(f['barIconColor'], '#7432e6')}`;
  }
}

