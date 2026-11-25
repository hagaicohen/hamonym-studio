import { ChangeDetectionStrategy, Component, Directive, ElementRef, Input, OnDestroy, ViewEncapsulation, inject, Renderer2 } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CardData } from '../cards/card-format';
import { heroSubtitleStyle, heroTitleStyle } from './part-format';
import { PagePart } from './page-part';

const YOUTUBE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double'];
/** Inline handlers of the media elements, kept as attributes: the exported page clones the DOM. */
const POSTER_ONERROR = "if(!this.dataset.retry){this.dataset.retry=1;this.src=this.src.replace('img.youtube.com','i.ytimg.com').replace('hqdefault.jpg','mqdefault.jpg')}else{this.hidden=true}";
const VIDEO_ONLOADEDMETADATA = 'if(this.duration && isFinite(this.duration)){try{this.currentTime=Math.min(1,Math.max(.1,this.duration*.08))}catch(e){}}';

/**
 * Inline handlers of a media element, kept as attributes (the exported page clones the DOM, without Angular):
 * set once on the element through Renderer2 (Angular does not bind `on*` attributes).
 */
@Directive({ selector: '[hamInlineHandlers]', standalone: true })
export class InlineHandlersDirective {
  private readonly el = inject(ElementRef).nativeElement as Element;
  private readonly renderer = inject(Renderer2);
  @Input({ required: true }) set hamInlineHandlers(handlers: Record<string, string>) {
    for (const [name, code] of Object.entries(handlers)) if (this.el.getAttribute(name) !== code) this.renderer.setAttribute(this.el, name, code);
  }
}

interface Slider { photos: { src: string; loading: string }[]; position: number; }

/**
 * The Hero (old core `renderPreview`, part `hero`, with `hamSetupHeroSlider` and the play handler):
 * the image or the video (a YouTube poster, or a file paused on an early frame) with its play button,
 * the organization's logo, the title and subtitle, and in the "slider" template the photos with their
 * arrows and dots (the current slide is kept by PublicPartsService across renders).
 *
 * After the page is written the core still fits the subtitle to one line. In panorama the page
 * projects the Hero stats card after `.hero` (the core measures its position in a race campaign).
 */
@Component({
  selector: 'section[ham-hero-part]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass("hero", cls)', 'data-part': 'hero' },
  imports: [NgTemplateOutlet, InlineHandlersDirective],
  template: `<ng-template #logoTpl><div [attr.class]="'hero-logo hero-anchor-' + text(h['logoAnchor']) + (logoBelow ? ' ham-logo-following-text' : '')"><div class="hero-logo-frame" [attr.style]="logo!.style"><img [attr.src]="logo!.src" alt="לוגו הקמפיין"></div></div></ng-template><div [attr.class]="hideName ? 'hero hu-hide-hero-name' : 'hero'" [attr.style]="heroStyle">@if (slider) {<div class="ham-hero-slider-photos" aria-hidden="true">@for (photo of slider.photos; track $index) {<img [attr.class]="$index === slider.position ? 'ham-hero-slide is-active' : 'ham-hero-slide'" [attr.src]="photo.src" alt="" [attr.loading]="photo.loading">}</div>}@if (video) {<div [attr.class]="playing ? 'hero-media-player playing' : 'hero-media-player'" [attr.data-hero-player]="video.youtube ? 'youtube' : 'file'">@if (video.youtube) {@for (k of [posterKey]; track k) {<img class="hero-video-poster" [attr.src]="video.poster" alt="תמונה מקדימה של הסרטון" [hamInlineHandlers]="posterHandlers">}} @else {@for (k of [videoKey]; track k) {<video class="hero-video hero-video-click" [attr.src]="video.src" playsinline preload="auto" muted [controls]="controls" [hamInlineHandlers]="videoHandlers"></video>}}<button type="button" class="hero-play-button" data-hero-play aria-label="הפעל סרטון" title="הפעל סרטון" (click)="play($event)"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button>@if (embed) {<iframe class="hero-embed" title="סרטון Hero" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen [src]="embed"></iframe>}</div>}@if (logo && !logoBelow) {<ng-container *ngTemplateOutlet="logoTpl" />}@if (showText) {<div [attr.class]="'hero-content hero-anchor-' + anchor" [attr.style]="'color:' + text(h['textColor']) + ';text-align:' + align('title', 'center')">@if (h['tag']) {<span class="hero-tag">{{ text(h['tag']) }}</span>}<div class="ham-hero-heading-group" [attr.style]="'--ham-hero-title-align:' + align('title', 'right') + ';--ham-hero-subtitle-align:' + align('subtitle', 'right')"><h1 [attr.style]="titleStyle + ';text-align:' + align('title', 'center')">{{ text(h['title']) }}</h1><p [attr.style]="subtitleStyle + ';text-align:' + align('subtitle', 'center') + (fitted ? ';font-size:' + fitted + ' !important' : '')">{{ text(h['subtitle']) }}</p></div>@if (logo && logoBelow) {<ng-container *ngTemplateOutlet="logoTpl" />}</div>}@if (slider && slider.photos.length > 1) {<div class="ham-hero-slider-controls"><button type="button" data-ham-slide-nav="prev" aria-label="תמונה קודמת">‹</button><span class="ham-hero-slide-count" dir="ltr">{{ slider.position + 1 }} / {{ slider.photos.length }}</span><button type="button" data-ham-slide-nav="next" aria-label="תמונה הבאה">›</button></div><div class="ham-hero-slider-dots" aria-label="תמונות הקמפיין">@for (photo of slider.photos; track $index) {<button type="button" [attr.data-ham-slide-dot]="$index" [attr.class]="$index === slider.position ? 'is-active' : ''" [attr.aria-label]="'מעבר לתמונה ' + ($index + 1)"></button>}</div>}</div><ng-content />`
})
export class HeroPartComponent extends PagePart implements OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly sanitizer = inject(DomSanitizer);
  /** Extra classes of the part section. */
  @Input() cls = '';

  private campaign!: CardData;
  h!: CardData;
  private mobile = false;
  /** On a phone, the panorama template places the text by its own mobile anchor. */
  private mobilePanorama = false;
  titleStyle = '';
  subtitleStyle = '';
  anchor = '';
  showText = false;
  video: { youtube: boolean; src: string; poster: string } | null = null;
  logo: { src: string; style: string } | null = null;
  slider: Slider | null = null;
  /** Desktop panorama, "logo below the text" (v4.47; old `hamApplyCampaignLayout` moved it): the logo ends the text block. */
  logoBelow = false;
  /** The management screen hides the campaign's name on the Hero (`hu-hide-hero-name`; it toggled the class after the render). */
  hideName = false;
  /** v4.53: the subtitle's fitted font size (`fitSubtitle`), or null while it has its own. */
  fitted: string | null = null;
  /** v4.53 (the play button changed the DOM): the player plays, the video file shows its controls, the YouTube player. */
  playing = false;
  controls = false;
  embed: SafeResourceUrl | null = null;
  /** A new video element after it was played (a render showed a new, paused one). */
  videoKey = 0;
  /** A new poster on each render: its inline fallback changes it (`data-retry`, `src`, `hidden`), and a render showed a new one. */
  posterKey = 0;
  readonly posterHandlers = { onerror: POSTER_ONERROR };
  readonly videoHandlers = { onloadedmetadata: VIDEO_ONLOADEDMETADATA, onseeked: 'this.pause()' };

  constructor() { super(); this.render(); this.parts.hero = this; }
  ngOnDestroy(): void { if (this.parts.hero === this) this.parts.hero = null; }

  protected render(): void {
    const campaign = this.campaign = this.parts.campaign;
    const h = this.h = campaign['content'].hero;
    this.mobile = this.parts.device() === 'mobile';
    this.mobilePanorama = this.mobile && campaign['template'] === 'panorama';
    this.titleStyle = heroTitleStyle(h);
    this.subtitleStyle = heroSubtitleStyle(h);
    this.anchor = this.text(this.mobilePanorama ? (h['mobileTextAnchor'] || 'middle-center') : h['textAnchor']);
    this.showText = h['showText'] !== false && (!this.mobile || h['showTextMobile'] === true);
    this.video = this.videoFor();
    this.logo = this.logoFor();
    this.slider = this.sliderFor();
    this.logoBelow = this.parts.layout.logoBelowText;
    this.hideName = this.parts.heroNameHidden;
    this.fitted = null;
    if (this.playing || this.controls) this.videoKey++;
    this.posterKey++;
    this.playing = this.controls = false;
    this.embed = null;
  }

  /**
   * v4.52 (old core, after the page was written): unless the subtitle may wrap (`subtitleWrap: 'auto'`), a
   * subtitle wider than its line gets a smaller font size (not below 9px), so it fits on one line.
   */
  fitSubtitle(): void {
    if (this.h['subtitleWrap'] === 'auto') return;
    const subtitle = this.host.querySelector<HTMLElement>('.hero-content .ham-hero-heading-group > p');
    if (!subtitle) return;
    const available = subtitle.clientWidth;
    if (!available) return;
    const size = parseFloat(getComputedStyle(subtitle).fontSize) || 14;
    const required = subtitle.scrollWidth;
    if (required > available + 1) { this.fitted = Math.max(9, Math.floor(size * available / required * 0.98)) + 'px'; this.cdr.detectChanges(); }
  }

  /** v4.53: the slide the slider shows (its arrows and dots, PublicPartsService). */
  showSlide(position: number): void {
    if (!this.slider) return;
    this.slider.position = position;
    this.cdr.detectChanges();
  }

  get heroStyle(): string {
    const h = this.h, isVideo = h['mediaType'] === 'video';
    const image = this.slider ? 'none' : `url('${this.parts.safe(isVideo ? (h['videoPoster'] || h['image']) : h['image'])}')`;
    return `height:${Number(h['height']) || 340}px;background-image:${image};background-position:${isVideo ? 'center' : this.text(h['position'])}`;
  }

  /**
   * Alignment of the title or subtitle: the saved alignment (the subtitle falls back to the title's),
   * or, in panorama on a phone, the side of the mobile anchor.
   */
  align(line: 'title' | 'subtitle', fallback: string): string {
    const h = this.h;
    if (this.mobilePanorama) {
      const a = h['mobileTextAnchor'];
      return a?.endsWith('right') ? 'right' : a?.endsWith('left') ? 'left' : 'center';
    }
    return this.text(line === 'subtitle' ? (h['subtitleAlign'] || h['titleAlign'] || h['textAlign'] || fallback) : (h['titleAlign'] || h['textAlign'] || fallback));
  }

  /**
   * The play button (old core preview handler): YouTube opens in an embedded player (in a new tab
   * from a local file), a video file starts with its controls.
   */
  async play(e: Event): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    const player = (e.currentTarget as Element).closest('[data-hero-player]');
    if (!player) return;
    const url = String(this.parts.campaign['content'].hero.video || '').trim();
    const match = url.match(YOUTUBE);
    if (match) {
      if (location.protocol === 'file:') {
        window.open('https://www.youtube.com/watch?v=' + match[1], '_blank', 'noopener,noreferrer');
        this.parts.toast('בקובץ מקומי הסרטון נפתח ב־YouTube כדי למנוע שגיאת נגן');
        return;
      }
      this.embed = this.sanitizer.bypassSecurityTrustResourceUrl('https://www.youtube.com/embed/' + match[1] + '?autoplay=1&playsinline=1&rel=0&controls=1');
      this.playing = true;
      this.cdr.detectChanges();
      return;
    }
    const video = player.querySelector('video');
    if (!video) return;
    this.controls = true;
    this.cdr.detectChanges();
    try { await video.play(); this.playing = true; this.cdr.detectChanges(); }
    catch { this.parts.toast('לא ניתן לנגן את הסרטון. יש לבדוק שהכתובת מובילה לקובץ וידאו תקין.'); }
  }

  text(v: unknown): string { return String(v ?? ''); }

  private videoFor(): { youtube: boolean; src: string; poster: string } | null {
    const h = this.h, url = String(h['video'] || '').trim();
    if (h['mediaType'] !== 'video' || !url) return null;
    const yt = url.match(YOUTUBE);
    const poster = String(h['videoPoster'] || '').trim();
    return { youtube: !!yt, src: this.parts.safe(url), poster: yt ? this.parts.safe(poster || `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`) : '' };
  }

  private logoFor(): { src: string; style: string } | null {
    const h = this.h;
    if (!h['showOrgLogo'] || !h['orgLogo']) return null;
    const size = Math.max(40, Math.min(280, Number(this.mobile && h['logoResponsive'] !== false ? h['logoWidthMobile'] : h['logoWidth']) || 110));
    // `Number(x) ?? 12` keeps NaN for a missing radius ("NaNpx"), as before.
    const radius = h['logoShape'] === 'circle' ? '50%' : Math.max(0, Math.min(80, Number(h['logoRadius']) ?? 12)) + 'px';
    const border = h['logoBorderStyle'] === 'none' ? 0 : Math.max(0, Math.min(16, Number(h['logoBorderWidth']) || 0));
    const borderStyle = BORDER_STYLES.includes(h['logoBorderStyle']) ? h['logoBorderStyle'] : 'solid';
    return {
      src: this.parts.safe(h['orgLogo']),
      style: `--logo-size:${size}px;--logo-radius:${radius};--logo-border-width:${border}px;--logo-border-style:${borderStyle};--logo-border-color:${this.text(h['logoBorderColor'] || '#ffffff')}`
    };
  }

  /** The "slider" template (not with a video): the Hero image, then up to five more photos. */
  private sliderFor(): Slider | null {
    const h = this.h;
    if (this.campaign['template'] !== 'slider' || h['mediaType'] === 'video') return null;
    const sources: string[] = [h['image'], ...(Array.isArray(h['slides']) ? h['slides'] : [])].filter(Boolean);
    if (!sources.length) return null;
    const position = this.parts.slide(sources);
    return { position, photos: sources.map((ref, i) => ({ src: this.parts.mediaSrc(ref), loading: i === 0 ? 'eager' : 'lazy' })) };
  }
}
