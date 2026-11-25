import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { CampaignStateService } from '../core/campaign-state.service';
import { PublicPartsService } from '../public-page/parts/public-parts.service';
import { DonationBoxComponent } from '../public-page/cards/donation-box.component';
import { CampaignShareComponent } from '../public-page/cards/campaign-share.component';
import { WideEditorService } from '../inspector/wide-editor';
import { StorySlidesService } from '../public-page/parts/story-slides.service';
import { CAMPAIGN_SECTIONS } from '../core/campaign-defaults';
import { studioAdopt } from '../core/studio-session';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** What the preview's interactions need from the editor (the core registers it once). */
export interface PreviewHost {
  device(): 'mobile' | 'desktop';
  select(id: string): void;
  /** The large editor for a block (`hamOpenLargeEditorFor`). */
  openEditor(id: string): void;
  /** A block a simple donation page cannot design. */
  locked(id: string): boolean;
  /** A mobile block shown only from the navigation menu (or null). */
  setActiveNav(id: string | null): void;
  panoramaSelectTab(id: string, preview: HTMLElement | null, scroll: boolean): void;
  renderPreview(): void;
  toast(message: string): void;
}
export interface Pencil { id: string; name: string; style: string }

/**
 * The live preview's editor interactions (v4.60), bound on `#preview` in AppComponent's template: a click selects the
 * block (and handles the page's navigation, share and donation demo actions, as the core's `#preview` listener did),
 * and the contextual edit pencil (EditPencilComponent) follows the hovered or focused block.
 */
@Injectable({ providedIn: 'root' })
export class PreviewSelectionService implements OnDestroy {
  private readonly state = inject(CampaignStateService);
  private readonly parts = inject(PublicPartsService);
  private readonly wide = inject(WideEditorService);
  private readonly slides = inject(StorySlidesService);
  host: PreviewHost | null = null;
  /** Before a click is handled (the management screen switches to design on a block click). */
  private readonly watchers: ((e: MouseEvent) => void)[] = [];
  attachHost(host: PreviewHost): void { this.host = host; }
  watch(fn: (e: MouseEvent) => void): void { this.watchers.push(fn); }
  private get h(): PreviewHost { if (!this.host) throw new Error('The preview has no editor host'); return this.host; }
  ngOnDestroy(): void { this.pencil.set(null); }

  private shareData(): { url: string; title: string; text: string } {
    const c = (this.state.current as any).content, sh = c.share || {}; const url = String(sh.url || '').trim() || location.href;
    return { url, title: c.hero.title, text: String(sh.message || '').trim() || c.hero.title };
  }

  /** A click in the preview. */
  onClick(e: any): void {
    // A panorama panel's view buttons (grid / list) change the panel only.
    const modeButton = e.target.closest('.ham-panorama-tab-panel [data-ham-view]');
    if (modeButton) {
      const panel = modeButton.closest('.ham-panorama-tab-panel');
      if (panel) {
        panel.dataset['hamViewMode'] = modeButton.dataset['hamView'] || 'grid';
        panel.querySelectorAll('[data-ham-view]').forEach((el: HTMLElement) => { const on = el === modeButton; el.classList.toggle('ham-view-active', on); el.setAttribute('aria-pressed', String(on)); });
        e.preventDefault(); e.stopPropagation(); return;
      }
    }
    for (const w of this.watchers) w(e);
    // An ambassador's profile link is followed, not handled by the editor.
    if (e.target.closest('.ambassador-profile-link')) e.stopPropagation();
    this.act(e);
    // A story gallery's arrows step its slideshow.
    const b = e.target.closest('[data-sb-slide]');
    if (b) { e.preventDefault(); e.stopPropagation(); const g = b.closest('.sb-gallery'); if (g) this.slides.step(g, b.dataset.sbSlide === 'prev' ? -1 : 1); }
  }
  /** The page's own actions, then the block's selection (the core's former `#preview` click handler). */
  private act(e: any): void {
    const h = this.h, doc = this.state.current as any, q = (s: string): any => document.querySelector(s);
    if(e.target.closest('[data-nav-dropdown],[data-nav-more]'))return;const navLink=e.target.closest('[data-nav-target]');if(navLink){const target=navLink.dataset.navTarget;
 if(h.device()==='desktop'&&doc.template==='panorama'&&['story','donors','ambassadors','comments','updates','sponsors'].includes(target)){
   const wrap=q('#preview .ham-panorama-tabs');const tabButton=wrap?.querySelector('[data-ham-panorama-tab="'+target+'"]');
   if(tabButton){h.panoramaSelectTab(target,q('#preview'),true);return;}
 }
 if(h.device()==='mobile'){h.setActiveNav(doc.content.nav.placement?.[target]==='menu'?target:null);h.renderPreview();}const section=q('#preview [data-part="'+target+'"]');if(section){section.scrollIntoView({behavior:'smooth',block:'start'});/* v4.53: the navigation renders the chosen link */if(q('#preview .nav-component'))this.parts.nav?.choose(target,navLink.textContent)}return}if(e.target.closest('[data-menu-toggle]'))return;if(e.target.closest('[data-ambassador]')){h.toast('הצטרפות לשגרירים תחובר לתהליך הקיים ב־HAMONYM');return}if(e.target.closest('[data-menu-item]')){h.toast('ניווט לעמוד הקמפיין יחובר במימוש Angular');return}// v4.53: the donation box renders its choice and its "other amount" field (DonationBoxComponent).
if(e.target.closest('[data-donation-other]')){
 const box=DonationBoxComponent.of(e.target.closest('.donation-box'));
 if(box&&box.hasEntry){box.showEntry(true);e.target.closest('.donation-box').querySelector('.donation-custom-entry input')?.focus()}
 box?.choose('other');return;
}
if(e.target.closest('[data-donation-choice]')){
 const btn=e.target.closest('[data-donation-choice]'),box=DonationBoxComponent.of(btn.closest('.donation-box'));
 box?.choose(btn.dataset.donationChoice);box?.showEntry(false);return;
}
if(e.target.closest('[data-donation-continue]')){h.toast('המשך התרומה יחובר למנוע התרומות הקיים ב־HAMONYM');return}if(e.target.closest('[data-donate]')){h.toast('כפתור התרומה יחובר לתהליך התרומה הקיים ב־HAMONYM');return}if(e.target.closest('[data-share]')){/* v4.53: the share block renders its options (CampaignShareComponent) */const share=CampaignShareComponent.of(q('#preview .share-options')?.closest('.campaign-share'));share?.toggle();return}if(e.target.closest('[data-copy]')){const link=this.shareData().url;const fallback=()=>{const input=document.createElement('textarea');input.value=link;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(studioAdopt(input));input.select();try{document.execCommand('copy');h.toast('הקישור הועתק')}catch{h.toast('לא ניתן להעתיק קישור')}input.remove()};if(navigator.clipboard?.writeText)navigator.clipboard.writeText(link).then(()=>h.toast('הקישור הועתק')).catch(fallback);else fallback();return}if(e.target.closest('[data-share-whatsapp]')){const link=this.shareData().url;window.open('https://wa.me/?text='+encodeURIComponent(this.shareData().text+'\n'+link),'_blank','noopener,noreferrer');return}if(e.target.closest('[data-share-facebook]')){window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(this.shareData().url),'_blank','noopener,noreferrer');return}if(e.target.closest('[data-share-telegram]')){const d=this.shareData();window.open('https://t.me/share/url?url='+encodeURIComponent(d.url)+'&text='+encodeURIComponent(d.text),'_blank','noopener,noreferrer');return}if(e.target.closest('[data-share-native]')){const link=this.shareData().url;if(navigator.share)navigator.share(this.shareData()).catch(()=>{});else h.toast('שיתוף מערכת אינו זמין בדפדפן זה');return}if(e.target.closest('[data-load],[data-donors-search],[data-hcc-search],.donors-sort-wrap,.hc-carousel-nav,.ambassador-profile-link,[data-ham-slide-nav],[data-ham-slide-dot],.ham-footer-news-form'))return;const el=e.target.closest('[data-part]');if(el)h.select(el.dataset.part)
  }

  // ---- the contextual edit pencil ----
  readonly pencil = signal<Pencil | null>(null);
  private hoverPart: HTMLElement | null = null;
  private hoverRevision = -1;
  private lastPointer: { x: number; y: number; type: string } | null = null;
  private ignoredClickUntil = 0;
  private resolvePart(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const part = target.closest<HTMLElement>('#preview [data-part].editable');
    return part && document.getElementById('preview')?.contains(part) ? part : null;
  }
  hide(): void {
    this.pencil.set(null);
    if (this.hoverPart && this.hoverRevision === this.parts.revision) this.parts.setHover(null);
    this.hoverPart = null;
  }
  private show(part: HTMLElement): void {
    const id = part.dataset['part'];
    if (!id || this.wide.isOpen || this.h.locked(id)) { this.hide(); return; }
    if (this.hoverPart === part && this.hoverRevision === this.parts.revision && this.pencil()) return;
    this.hide();
    this.hoverPart = part; this.hoverRevision = this.parts.revision;
    this.parts.setHover(id);
    // The pencil lives outside the rendered campaign: a render may replace `part` before the click ends.
    const name = CAMPAIGN_SECTIONS.find((item: string[]) => item[0] === id)?.[1] || 'הרכיב';
    const rect = part.getBoundingClientRect();
    this.pencil.set({ id, name, style: `position: fixed !important; z-index: 2147483000 !important; inset: ${Math.max(8, rect.top + 10)}px auto auto ${Math.max(8, rect.left + 10)}px !important;` });
  }
  /** `#preview` pointerover / pointermove: the hovered block gets the pencil. */
  hover(e: PointerEvent): void {
    if (e.type === 'pointermove') this.lastPointer = { x: e.clientX, y: e.clientY, type: e.pointerType };
    if (e.pointerType === 'touch' || this.wide.isOpen) return;
    const part = this.resolvePart(e.target); if (part) this.show(part);
  }
  /** The pointer left the preview: a render no longer re-hovers under it. */
  leave(): void { this.lastPointer = null; }
  /** A touch on a block (not on its own controls) shows the pencil. */
  pointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    const part = this.resolvePart(e.target);
    if (part && !(e.target instanceof Element && e.target.closest('button,a,input,textarea,select,[role="button"]'))) this.show(part);
  }
  focusIn(e: FocusEvent): void { const part = this.resolvePart(e.target); if (part) this.show(part); }
  /** After a render the page is new: the block under a pointer that did not move is hovered again. */
  afterRender(): void {
    const at = this.lastPointer;
    if (!at || at.type === 'touch') return;
    requestAnimationFrame(() => {
      if (this.wide.isOpen) return;
      const target = document.elementFromPoint(at.x, at.y);
      if (target instanceof Element && target.closest('[data-ham-preview-edit]')) return;
      const part = this.resolvePart(target);
      if (part) this.show(part);
    });
  }
  /** The pencil opens the large editor on the first press; a later click (keyboard, assistive tech) also does. */
  pencilDown(e: PointerEvent, id: string): void { e.preventDefault(); e.stopPropagation(); this.h.openEditor(id); this.ignoredClickUntil = performance.now() + 450; }
  pencilClick(e: MouseEvent, id: string): void { e.preventDefault(); e.stopPropagation(); if (performance.now() < this.ignoredClickUntil) return; this.h.openEditor(id); }
}
