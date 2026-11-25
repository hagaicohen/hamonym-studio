import { STUDIO_PUBLIC_ACTIONS } from '../../../studio-public-actions';
import { ChangeDetectionStrategy, Component, ElementRef, Input, ViewEncapsulation, inject } from '@angular/core';
import { PagePart } from '../parts/page-part';
import { NgTemplateOutlet } from '@angular/common';
import { CardData } from './card-format';

interface ShareAction { id: 'whatsapp' | 'facebook' | 'telegram' | 'copy' | 'native'; label: string; attr: string; color: string; }

/** The share actions, in order: the setting that hides each, and its brand color. */
const ACTIONS: (ShareAction & { setting: string })[] = [
  { setting: 'showWhatsApp', id: 'whatsapp', label: 'WhatsApp', attr: 'share-whatsapp', color: '#25D366' },
  { setting: 'showFacebook', id: 'facebook', label: 'Facebook', attr: 'share-facebook', color: '#1877F2' },
  { setting: 'showTelegram', id: 'telegram', label: 'Telegram', attr: 'share-telegram', color: '#229ED9' },
  { setting: 'showCopy', id: 'copy', label: 'העתקת קישור', attr: 'copy', color: '#64748B' },
  { setting: 'showNative', id: 'native', label: 'שיתוף', attr: 'share-native', color: '#64748B' }
];

/**
 * The campaign's share block (old core `shareMarkup`): one "share" button that opens the actions
 * (`mode: 'button'`), or the actions themselves (`icons`, or with labels). The document handlers
 * act on `[data-share]`, `[data-share-whatsapp]`, `[data-copy]`… and open `.share-options`.
 */
@Component({
  selector: 'div[ham-campaign-share]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'campaign-share', '[attr.style]': 'vars' },
  template: `<ng-template #actionList>@for (a of actions; track a.id) {<button type="button" [attr.style]="'--share-action-icon-color:' + (cfg['iconColorMode'] === 'custom' ? text(cfg['color']) : a.color)" class="share-action" (click)="share(a.id)" [class.share-icon-only]="mode === 'icons'" [attr.data-share-whatsapp]="a.attr === 'share-whatsapp' ? 'true' : null" [attr.data-share-facebook]="a.attr === 'share-facebook' ? 'true' : null" [attr.data-share-telegram]="a.attr === 'share-telegram' ? 'true' : null" [attr.data-copy]="a.attr === 'copy' ? 'true' : null" [attr.data-share-native]="a.attr === 'share-native' ? 'true' : null" [attr.title]="a.label" [attr.aria-label]="a.label">@switch (a.id) {
  @case ('whatsapp') {<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.4 11.7a8.4 8.4 0 0 1-12.5 7.4L3 20.5l1.4-4.7A8.4 8.4 0 1 1 20.4 11.7Z"/><path d="M8.5 8.5c.2 3 3.4 6.2 6.5 6.8l1.2-1.5-2.1-1.1-1 1c-1.4-.5-2.7-1.8-3.2-3.2l1-1-1.1-2.1z"/></svg>}
  @case ('facebook') {<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.1 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.5 1.6-1.5h1.7V3.3c-.3 0-1.3-.2-2.5-.2-2.5 0-4.1 1.5-4.1 4.2v2.5H8V13h2.8v8z"/></svg>}
  @case ('telegram') {<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m21 3-3.7 17-5.5-4-3 2.8.6-4.2L3 12z"/><path d="m9.4 14.6 8.5-8"/></svg>}
  @case ('copy') {<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>}
  @case ('native') {<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 16V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>}
}@if (mode !== 'icons') {<span>{{ a.label }}</span>}</button>}</ng-template>@if (strip) {<svg class="ham-share-strip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.8 10.5 6.4-4M8.8 13.5l6.4 4"/></svg><strong class="ham-share-strip-title">שתפו את הקמפיין</strong>}@if (mode === 'button') {@if (!strip) {<div class="share-row"><button type="button" class="share-main" data-share="true" (click)="platform ? toggle() : null" [attr.aria-expanded]="expanded">↗ {{ cfg['text'] || 'שיתוף הקמפיין' }}</button></div>}<div class="share-options" [class.share-actions]="strip" [hidden]="!shown"><ng-container *ngTemplateOutlet="actionList" /></div>} @else {<div class="share-actions"><ng-container *ngTemplateOutlet="actionList" /></div>}`,
  imports: [NgTemplateOutlet]
})
export class CampaignShareComponent extends PagePart {
  readonly platform=inject(STUDIO_PUBLIC_ACTIONS,{optional:true});
  share(id:string):void{if(this.platform)void this.platform.share(id);}
  private static readonly shares = new WeakMap<Element, CampaignShareComponent>();
  /** The share block rendered at this `.campaign-share` element (the preview's handler). */
  static of(el: Element | null | undefined): CampaignShareComponent | undefined { return el ? CampaignShareComponent.shares.get(el) : undefined; }
  constructor() { super(); CampaignShareComponent.shares.set(inject(ElementRef).nativeElement, this); }

  /** v4.53 (the preview's handler toggled the DOM): the options are shown; a render shows them as rendered (the strip's, or closed). */
  private toggled: boolean | null = null;
  get shown(): boolean { return this.toggled ?? this.strip; }
  get expanded(): string { return this.toggled === null ? 'false' : String(this.toggled); }
  toggle(): void { this.toggled = !this.shown; this.cdr.detectChanges(); }
  protected render(): void { this.toggled = null; }

  /** `content.share`. */
  @Input() cfg: CardData = {};
  /**
   * The desktop panorama's share strip (v4.47; old `hamApplyCampaignLayout` rewrote the block): an icon
   * and a title, then the actions themselves (shown, no "share" button).
   */
  @Input() strip = false;

  get mode(): string { return this.cfg['mode'] || 'button'; }
  get actions(): ShareAction[] { return ACTIONS.filter(a => this.cfg[a.setting] !== false); }
  get vars(): string {
    const c = this.cfg;
    return `--share-bg:${this.text(c['bg'])};--share-color:${this.text(c['color'])};--share-border:${this.text(c['border'])};--share-radius:${Number(c['radius']) || 0}px;--share-icon-size:${Number(c['iconSize']) || 21}px`;
  }
  /** As the core's `esc` printed a value: '' for null/undefined. */
  text(v: unknown): string { return String(v ?? ''); }
}
