import { ChangeDetectionStrategy, Component, ElementRef, Input, OnInit, Renderer2, ViewEncapsulation, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CardData } from '../cards/card-format';
import { hexColor6 } from '../../core/campaign-style';
import { PagePart } from './page-part';
import { CARDCOM_LOGO } from './cardcom-logo';
import { STUDIO_PUBLIC_ACTIONS } from '../../../studio-public-actions';
import { CartStoreService } from '../../cart/cart-store.service';
import { CampaignCartService } from '../../cart/campaign-cart.service';

/** The form's state (the core's `hamSimpleFlowState`, shared with the wizard). */
export interface SimpleFlowState {
  step: number; frequency: string; amount: number | 'other'; custom: string; fullName: string; email: string; phone: string;
  identityNumber: string; anonymous: boolean; dedication: string; done: boolean; error: string;
  [field: string]: unknown;
}

const ICONS: Record<string, string> = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1Z',
  hand: 'M8 14l3 2 5-6M4 12V7a2 2 0 0 1 4 0v3M8 10V5a2 2 0 0 1 4 0v4M12 9V6a2 2 0 0 1 4 0v4M16 10a2 2 0 0 1 4 0v5c0 5-4 7-8 7s-8-3-8-8v-2'
};
const STEPS: [number, string][] = [[1, 'סכום'], [2, 'פרטים אישיים'], [3, 'תשלום']];
const FIELDS: [string, string, string, string, string | null][] = [
  // field, type, label / placeholder, autocomplete, inputmode
  ['fullName', 'text', 'שם מלא', 'name', null], ['email', 'email', 'כתובת אימייל', 'email', null], ['phone', 'tel', 'טלפון', 'tel', null],
  ['identityNumber', 'text', 'תעודת זהות (לא חובה)', '', 'numeric'], ['dedication', 'text', 'הקדשה (לא חובה)', '', null]
];
const anchor = (v: unknown, fallback: string): string => /^(top|middle|bottom)-(right|center|left)$/.test(String(v)) ? String(v) : fallback;
const num = (v: unknown, min: number, max: number, def: number): number => Math.min(max, Math.max(min, Number.isFinite(+(v as number)) ? +(v as number) : def));
const money = (n: unknown): string => '₪' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * The simple donation page (v4.51; old core `hamRenderSimpleDonation` and its document handlers): the head
 * (avatar, logo or hero photo, title and second line), the steps bar, the amount step (frequency, the box's
 * preset amounts with the defaults, another amount), the personal details (with the ID number's check digit),
 * payment (the Cardcom note), and the Cardcom footer. The state is the core's (`hamSimpleFlowState`, shared
 * with the wizard), the visual settings are `management.simpleDonation` (core `hamSimpleVisualSettings`).
 *
 * A step changes the state and the form renders itself. The old code wrote the shell again, at the end of
 * #preview, after each step; on a phone that is after the action bar, so the first step moves the form there
 * (PublicPageComponent renders it in that place, `moveSimple`).
 */
@Component({
  selector: 'section[ham-simple-donation]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hsf-shell hsf-from-demo', 'aria-label': 'דף תרומה פשוט', dir: 'rtl',
    '[attr.style]': 'shellStyle',
    '(click)': 'click($event)', '(input)': 'input($event)', '(change)': 'change($event)'
  },
  template: `<div class="hsf-card"><header [attr.class]="'hsf-head hsf-new-head hsf-layout-' + layout + ' ' + (heroMode ? 'hsf-has-photo' : '')" [attr.style]="headStyle"><div [attr.class]="'hsf-identity-group hsf-group-' + identityPosition">@if (symbol) {<div class="hsf-new-logo" [attr.style]="logoFrameStyle">@if (symbol === 'avatar') {<ng-container *ngTemplateOutlet="avatarTpl" />} @else {<div class="hsf-logo"><img [attr.src]="logo" alt="לוגו הארגון"></div>}</div>}<div class="hsf-new-title" [attr.style]="'text-align:' + titleAlign">@if (title) {<h1 [attr.style]="titleStyle">{{ title }}</h1>}@if (desc) {<p [attr.style]="descStyle">{{ desc }}</p>}</div></div></header>@if (v['showSteps']) {<nav class="hsf-steps" aria-label="שלבי תרומה">@for (s of steps; track s[0]; let i = $index) {@if (i) {<span class="hsf-line"></span>}<span [attr.class]="'hsf-stage ' + (h.step === s[0] ? 'current' : '') + ' ' + (h.step > s[0] ? 'done' : '')"><span class="hsf-stage-no">{{ s[0] }}</span>{{ s[1] }}</span>}</nav>}<div class="hsf-content">@if (h.done) {<div class="hsf-success"><span class="hsf-success-check">✓</span><h2>תודה על הרצון לתרום!</h2><p>תודה על תרומתך.</p><button type="button" class="hsf-next" data-hsf-restart>חזרה להתחלה</button></div>} @else if (h.step === 1) {<div class="hsf-frequencies" role="group" aria-label="סוג תרומה"><button type="button" data-hsf-frequency="once" [attr.class]="h.frequency === 'once' ? 'active' : ''" [attr.aria-pressed]="String(h.frequency === 'once')">חד־פעמית</button><button type="button" data-hsf-frequency="monthly" [attr.class]="h.frequency === 'monthly' ? 'active' : ''" [attr.aria-pressed]="String(h.frequency === 'monthly')">הוראת קבע חודשית</button></div><h2 class="hsf-caption">בחר/י סכום לתרומה {{ h.frequency === 'once' ? 'חד פעמית' : 'חודשית' }}</h2><div class="hsf-amounts">@for (n of amounts; track n) {<button type="button" [attr.data-hsf-amount]="n" [attr.class]="h.amount === n ? 'selected' : ''" [attr.aria-pressed]="String(h.amount === n)">{{ money(n) }}</button>}</div><label [attr.class]="'hsf-custom ' + (h.amount === 'other' ? 'selected' : '')"><span class="hsf-currency">₪</span><input data-hsf-custom inputmode="decimal" autocomplete="off" placeholder="סכום אחר" [attr.value]="h.custom" aria-label="סכום אחר"></label>} @else if (h.step === 2) {<div class="hsf-personal">@for (f of fields; track f[0]) {<label class="hsf-input-field"><span class="hsf-sr-only">{{ f[2] }}</span><input [attr.type]="f[1]" [attr.inputmode]="f[4]" [attr.maxlength]="f[0] === 'identityNumber' ? 9 : null" [attr.data-hsf-field]="f[0]" [attr.autocomplete]="f[3] || null" [attr.value]="field(f[0])" [attr.required]="f[0] === 'fullName' || f[0] === 'email' ? '' : null" [attr.aria-label]="f[2]" [attr.placeholder]="f[2] + (f[0] === 'fullName' || f[0] === 'email' ? ' *' : '')"></label>}<label class="hsf-anonymous"><input type="checkbox" data-hsf-anonymous [attr.checked]="h.anonymous ? '' : null">אני מעוניין/ת שתרומתי תוצג בעילום שם</label></div>} @else {<h2 class="hsf-section-title">פרטי תשלום</h2><div class="hsf-summary"><div><span>{{ h.frequency === 'monthly' ? 'תרומה חודשית' : 'תרומה חד־פעמית' }}</span><strong>{{ money(value) }}</strong></div><div><span>שם התורם/ת</span><strong>{{ h.fullName }}</strong></div></div><p class="hsf-payment-note">פרטי התשלום יוזנו במערכת הסליקה המאובטחת של Cardcom לאחר חיבור מסוף הסליקה.</p>}<div class="hsf-actions">@if (!h.done) {<button type="button" class="hsf-next" data-hsf-next [attr.disabled]="h.step === 3 ? '' : null" [attr.title]="h.step === 3 ? 'יש לחבר מסוף סליקה לפני הפעלת תשלום' : null">{{ h.step === 1 ? 'המשך לפרטים אישיים' : h.step === 2 ? 'המשך לתשלום' : 'מעבר לסליקה' }} ←</button>@if (h.step > 1) {<button type="button" class="hsf-back" data-hsf-back>חזרה</button>}}</div><div class="hsf-error" role="status">{{ h.error }}</div></div><footer class="hsf-footer hsf-cardcom-footer"><span class="hsf-cardcom-lock" aria-hidden="true">♙</span><span>הסליקה המאובטחת מתבצעת באמצעות</span><img [attr.src]="cardcom" alt="CARDCOM"></footer></div><ng-template #avatarTpl><div class="hsf-logo hsf-symbol" [attr.style]="'--hsf-heart-color:' + avatarColor" aria-label="סמל הקמפיין"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon"/></svg></div></ng-template>`,
  imports: [NgTemplateOutlet]
})
export class SimpleDonationComponent extends PagePart implements OnInit {
  readonly platform=inject(STUDIO_PUBLIC_ACTIONS,{optional:true});
  private readonly cart=inject(CartStoreService);
  private readonly cartUi=inject(CampaignCartService);
  /** Asks the page to render the form after the action bar (old: written again at the end of #preview). */
  @Input() moved?: () => void;
  h!: SimpleFlowState;
  v!: CardData;
  readonly steps = STEPS;
  readonly fields = FIELDS;
  readonly cardcom = CARDCOM_LOGO;
  readonly String = String;
  readonly money = money;

  private c!: CardData;
  amounts!: number[];
  title!: string;
  desc!: string;
  logo!: string;
  private heroImage!: string;
  icon!: string;
  avatarColor!: string;
  heroMode!: boolean;
  layout!: string;
  symbol!: string;
  identityPosition!: string;
  titleAlign!: string;
  private overlay!: boolean;
  titleStyle!: string;
  descStyle!: string;
  logoFrameStyle!: string;
  headStyle!: string;
  shellStyle!: string;

  constructor() { super(); this.render(); }

  /** The form from the flow's state and the visual settings (v4.53: again on each page render, in place). */
  protected render(): void {
    this.h = this.parts.simpleState() as SimpleFlowState;
    this.v = this.parts.simpleVisual();
    this.c = this.parts.campaign['content'] || {};
    this.amounts = (() => {
      const d = this.c['donate'] || {};
      const presets = (Array.isArray(d['boxAmounts']) ? d['boxAmounts'] : []).filter((x: CardData) => x && Number(x['amount']) > 0 && x['kind'] !== 'recurring').map((x: CardData) => Number(x['amount']));
      return [...new Set<number>([...presets, ...[50, 100, 180, 360, 500, 1000]])].sort((a, b) => a - b).slice(0, 6);
    })();
    this.title = String(this.c['hero']?.title || this.c['title']?.title || '').trim();
    this.desc = String(this.c['hero']?.subtitle || '').trim() || String(this.c['title']?.description || '').trim();
    this.logo = String(this.c['hero']?.orgLogo || '').trim();
    this.heroImage = String(this.c['hero']?.image || '').trim();
    this.icon = ICONS[this.v['avatarSymbol']] || ICONS['heart'];
    this.avatarColor = /^#[0-9a-fA-F]{6}$/.test(this.v['avatarColor']) ? this.v['avatarColor'] : '#246f65';
    this.heroMode = (this.v['showHeroImage'] === true || (this.v['showHeroImage'] == null && this.v['identityMode'] === 'hero')) && !!this.heroImage;
    /** No layout switch (v244): the photo overlays the head, else it is centred. */
    this.layout = this.heroMode ? 'overlay' : 'center';
    /** 'avatar', 'logo' (the organization's logo, or the avatar when there is none) or '' (no symbol). */
    this.symbol = this.layout === 'overlay' && this.v['showHeroLogo'] === false ? '' : this.v['identityMode'] === 'avatar' || !this.logo ? 'avatar' : 'logo';
    this.identityPosition = anchor(this.v['identityPosition'], 'middle-center');
    this.titleAlign = ['right', 'left'].includes(this.v['titleAlign']) ? this.v['titleAlign'] : 'center';
    this.overlay = this.layout === 'overlay';
    this.titleStyle = `font-size:${num(this.v['titleFontSize'], 12, 40, 19)}px;font-weight:${num(this.v['titleWeight'], 400, 900, 800)};color:${hexColor6(this.overlay ? this.v['heroTitleColor'] : this.v['titleColor'], this.overlay ? '#ffffff' : '#071b35')}`;
    this.descStyle = `font-size:${num(this.v['subtitleFontSize'], 10, 28, 12)}px;font-weight:${num(this.v['subtitleWeight'], 400, 900, 500)};color:${hexColor6(this.overlay ? this.v['heroSubtitleColor'] : this.v['subtitleColor'], this.overlay ? '#ffffff' : '#8499be')}`;
    this.logoFrameStyle = `--hsf-logo-size:${num(this.v['avatarSize'], 28, 90, 46)}px;--hsf-logo-border:${this.v['logoBorder'] === true ? num(this.v['logoBorderWidth'], 1, 6, 1) : 0}px;--hsf-logo-border-color:${hexColor6(this.v['logoBorderColor'], '#e1e8e5')};--hsf-logo-bg:${hexColor6(this.v['logoBackground'], '#ffffff')};--hsf-logo-radius:${this.v['logoShape'] === 'square' ? '0' : this.v['logoShape'] === 'rounded' ? '12px' : '50%'}`;
    this.headStyle = `--hsf-head-mobile:${num(this.v['heroHeightMobile'], 110, 240, 150)}px;--hsf-head-desktop:${num(this.v['heroHeightDesktop'], 150, 310, 210)}px;${this.heroMode && this.heroImage ? `background-image:url("${this.heroImage}") !important` : ''}`;
    this.shellStyle = (() => {
      const v = this.v, c = (x: unknown, d: string) => hexColor6(x, d);
      const vars: [string, unknown][] = [['--hsf-amount-bg', v['amountColor']], ['--hsf-amount-border', v['amountBorderColor']], ['--hsf-amount-hover', v['amountHoverColor']],
        ['--hsf-selected-border', v['amountSelectedBorderColor']], ['--hsf-continue-hover', v['buttonHoverColor']], ['--hsf-continue-text', v['buttonTextColor']],
        ['--hsf-continue-border', v['buttonBorderColor']], ['--hsf-steps-active', v['stepsActiveColor']], ['--hsf-steps-inactive', v['stepsInactiveColor']],
        ['--hsf-text-color', v['textColor']], ['--hsf-button-radius', Math.max(0, Math.min(32, +v['buttonRadius'] || 0)) + 'px']];
      const font = ['Heebo', 'Assistant', 'Rubik', 'Arial'].includes(v['fontFamily']) ? v['fontFamily'] + ',Arial,sans-serif' : 'Heebo,Arial,sans-serif';
      return `--hsf-page-color:${c(v['pageColor'], '#ffffff')};--hsf-card-color:${c(v['cardColor'], '#ffffff')};--hsf-selected-color:${c(v['amountSelectedColor'], '#f0faf4')};--hsf-continue-color:${c(v['continueButtonColor'], '#73cc97')};`
        + vars.map(([k, x]) => `${k}:${typeof x === 'string' && x.startsWith('#') ? c(x, '#246f65') : x}`).join(';') + `;font-family:${font}`;
    })();
    if (this.renderedOnce) this.ngOnInit();
    this.renderedOnce = true;
  }
  private renderedOnce = false;

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly renderer = inject(Renderer2);
  ngOnInit(): void { this.renderer.setAttribute(this.host, 'data-checkout-step', String(this.h.step)); }
  /** The form after a change: the step on the host (a host binding is the page's to refresh), then this template. */
  private refresh(): void { this.ngOnInit(); this.cdr.detectChanges(); }

  get value(): number { return Number(this.h.amount === 'other' ? this.h.custom : this.h.amount); }
  field(name: string): string { return String(this.h[name] ?? ''); }

  /** Old document click handler: frequency, an amount, back, next (with the checks), restart. */
  click(e: Event): void {
    const btn = (e.target as Element).closest<HTMLElement>('[data-hsf-frequency],[data-hsf-amount],[data-hsf-back],[data-hsf-next],[data-hsf-restart]');
    if (!btn) return;
    e.preventDefault();
    const h = this.h; h.error = '';
    if (btn.hasAttribute('data-hsf-frequency')) h.frequency = btn.dataset['hsfFrequency']!;
    else if (btn.hasAttribute('data-hsf-amount')) { h.amount = Number(btn.dataset['hsfAmount']); h.custom = ''; }
    else if (btn.hasAttribute('data-hsf-back')) h.step = Math.max(1, h.step - 1);
    else if (btn.hasAttribute('data-hsf-restart')) { h.step = 1; h.done = false; }
    else if (h.step === 1) { if (!(this.value > 0)) h.error = 'יש לבחור סכום תרומה חיובי'; else h.step = 2; }
    else if (h.step === 2) {
      const id = (h.identityNumber || '').trim();
      const validId = !id || (/^\d{1,9}$/.test(id) && id.padStart(9, '0').split('').reduce((sum, ch, i) => { const v = Number(ch) * (i % 2 === 0 ? 1 : 2); return sum + (v > 9 ? v - 9 : v); }, 0) % 10 === 0);
      if (!h.fullName.trim()) h.error = 'נא למלא שם מלא';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email.trim())) h.error = 'נא להזין כתובת אימייל תקינה';
      else if (!validId) h.error = 'מספר תעודת הזהות אינו תקין';
      else if(this.platform){
        this.cart.entries.update(entries=>[...entries.filter(entry=>!entry.selectionBased),{uid:'simple-donation-'+Date.now(),kind:'donation',title:'תרומה',info:'',price:this.value,qty:1,recurring:h.frequency==='monthly',selectionBased:true}]);
        this.cartUi.open(true,{name:h.fullName.trim(),email:h.email.trim(),phone:h.phone.trim(),idNumber:id});
      } else h.step = 3;
    } else h.error = 'יש לחבר מסוף סליקה של Cardcom לפני שניתן לבצע תשלום';
    if (this.moved) this.moved(); else this.refresh();
  }

  /** Old document input handler: another amount (cleaned), a personal field, the anonymous checkbox. */
  input(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.matches('[data-hsf-custom]')) {
      const cleaned = el.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 12);
      this.h.custom = cleaned; this.h.amount = 'other'; this.renderer.setProperty(el, 'value', cleaned);
      this.refresh();
    } else if (el.matches('[data-hsf-field]')) this.h[el.dataset['hsfField']!] = el.value;
    else if (el.matches('[data-hsf-anonymous]')) this.h.anonymous = el.checked;
  }
  change(e: Event): void { const el = e.target as HTMLInputElement; if (el.matches('[data-hsf-anonymous]')) this.h.anonymous = el.checked; }
}
