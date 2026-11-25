import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { CampaignStateService } from '../../core/campaign-state.service';
import { CardData } from '../cards/card-format';
import { PageLayout } from './page-layout';

/** What the core provides (registered once at start). */
export interface PartsHooks {
  /** The preview's current device. */
  device(): string;
  /** The block chosen in the editor, and whether the preview highlights it. */
  selected(): string;
  highlight(): boolean;
  /** The block a mobile "menu-only" link opened (old core `activeNavSection`). */
  activeNavSection(): string | null;
  /** The block is shown on this device (old core `deviceAllowed`). */
  deviceAllowed(id: string): boolean;
  /** A block's extra classes: on a phone, a block placed only in the navigation menu (`menu-only-*`). */
  contentPartClass(id: string): string;
  /** The donation box's settings for this device (old core `dbStyleForDevice`), or null when the box is off. */
  donationBox(): Record<string, unknown> | null;
  /** The story's public markup (Story Builder: `sbRenderNode` per node). */
  storyMarkup(blocks: unknown): string;
  /** v4.51: the simple donation page's state (`hamSimpleFlowState`) and visual settings (`hamSimpleVisualSettings`). */
  simpleState(): unknown;
  simpleVisual(): CardData;
  /** The editor toast. */
  toast(text: string): void;
  /** The blocks' order on this device (old core `orderFor`). */
  order(): string[];
  /** The panorama's current tab (old core `hamPanoramaActiveTab`), and its reset. */
  panoramaTab(): string;
  setPanoramaTab(id: string): void;
  /** The Hero stats card's shapes and meters (core `hamCardDesignLibrary`). */
  cardDesign(): { shapes: string[]; meters: string[] };
}

/** A copy of the campaign for a render (structured data; the live object if it cannot be copied). */
function snapshot(campaign: CardData): CardData {
  try { return structuredClone(campaign); } catch { return campaign; }
}

type TabWindow = Window & { hamMobileCurrentTab?: string };
type MediaWindow = Window & { hamonymMediaFix?: { src?(ref: string): string; patchMedia?(root?: Element): void } };

/**
 * The parts of the public page that are components since v4.46 (header, Hero, campaign info, title,
 * stats, donate button, campaign navigation, story, footer, sticky donate button).
 *
 * - **Rendering.** The page is PublicPageComponent, rendered by the core's `renderPreview` on every
 *   change (`CampaignCardsService.renderPage`); since v4.53 in place (`revision`, PagePart). Each part's host is the part's own `<section
 *   class="editable" data-part="…">` (no wrapper). A part reads the campaign (`CampaignStateService`)
 *   and the editor state below when it is rendered.
 * - **Editor state** comes from the core through `PartsHooks` (device, selected block, menu-only link).
 * - **Hero slider.** The current slide (old core `hamHeroSlidePosition`/`hamHeroSlideKey`) lives
 *   here, and so does its document handler (registered where the core registered it, so the order of
 *   the document listeners is unchanged).
 */
@Injectable({ providedIn: 'root' })
export class PublicPartsService implements OnDestroy {
  private readonly campaignState = inject(CampaignStateService);
  private hooks: PartsHooks | null = null;
  private slideKey = '';
  private slidePosition = 0;
  /**
   * The structure of the page being rendered (v4.47, `pageLayout`): set by PublicPageComponent before
   * its parts are created, read by the parts for what the layout changes in them.
   */
  layout = new PageLayout();

  /**
   * v4.53: the page is rendered again in place. Each render increments `revision`; every part sees it when the
   * page is checked and computes again (PagePart). `campaign` is the campaign as the render saw it (a copy taken
   * when the render starts): the management screen's guidance changes the campaign for the render only, and a part
   * updated later (a tab, the slider, a menu) still shows what was rendered.
   */
  revision = 0;
  private rendered: CardData | null = null;
  get campaign(): CardData { return this.rendered ?? this.campaignState.current as CardData; }

  /** The page's parts that other code reaches (the core's handlers, AppComponent, the minute timer). */
  header: { closeMenu(): void } | null = null;
  nav: { choose(target: string, label: string): void } | null = null;
  hero: { showSlide(position: number): void; fitSubtitle(): void } | null = null;
  readonly countdowns = new Set<{ tick(endAt: unknown, mobile: boolean): void }>();
  /** The page itself: check it after a change of the state below. */
  page: { check(): void } | null = null;
  /** The management screen hides the campaign's name on the Hero (set for the render by its render wrapper). */
  heroNameHidden = false;
  /**
   * v4.53 (the tabs' handlers changed the DOM): the panorama tab and the mobile tab chosen since the render, or null
   * (the page shows the tabs the render laid out).
   */
  readonly panoramaSelected = signal<string | null>(null);
  readonly mobileSelected = signal<string | null>(null);

  /** A render starts: the next revision, the campaign as it is now, and what a new page started without. */
  beginRender(): void {
    this.revision++;
    this.rendered = null;
    this.rendered = snapshot(this.campaignState.current as CardData);
    this.panoramaSelected.set(null);
    this.mobileSelected.set(null);
    this.hover = null;
  }

  /** The block under the editor's pointer (the core's contextual edit launcher: `ham-preview-edit-hover`). */
  private hover: string | null = null;
  setHover(id: string | null): void {
    if (this.hover === id) return;
    this.hover = id;
    this.page?.check();
  }

  /**
   * The render is over: a part created or updated later reads the campaign as it is (a new part did before: the
   * guidance is the render's only). The parts keep what they computed from the render's copy.
   */
  endRender(): void { this.rendered = null; }

  /** `hamPanoramaSelectTab` (the core: the tab buttons, the panels, the story and the title). */
  selectPanoramaTab(id: string): void { this.panoramaSelected.set(id); this.page?.check(); }
  /** A mobile tab was clicked (CampaignRenderFinalizerService). */
  selectMobileTab(id: string): void { this.mobileSelected.set(id); this.page?.check(); }
  /** The core's minute timer: the countdown of the campaign's end date. */
  tick(endAt: unknown, mobile: boolean): void { this.countdowns.forEach(c => c.tick(endAt, mobile)); }
  device(): string { return this.hooks?.device() || 'mobile'; }
  activeNavSection(): string | null { return this.hooks?.activeNavSection() ?? null; }
  deviceAllowed(id: string): boolean { return this.hooks ? this.hooks.deviceAllowed(id) : true; }
  storyMarkup(blocks: unknown): string { return this.hooks?.storyMarkup(blocks) || ''; }
  simpleState(): unknown { return this.hooks!.simpleState(); }
  simpleVisual(): CardData { return this.hooks!.simpleVisual(); }
  contentPartClass(id: string): string { return this.hooks?.contentPartClass(id) || ''; }
  donationBox(): CardData | null { return (this.hooks?.donationBox() as CardData | null) ?? null; }
  toast(text: string): void { this.hooks?.toast(text); }
  order(): string[] { return this.hooks?.order() || []; }
  panoramaTab(): string { return this.hooks?.panoramaTab() || 'story'; }
  setPanoramaTab(id: string): void { this.hooks?.setPanoramaTab(id); }
  /** The mobile tab (`window.hamMobileCurrentTab`, a contract: other code reads and sets it), and its reset. */
  mobileTab(): string { return (window as TabWindow).hamMobileCurrentTab || 'story'; }
  setMobileTab(id: string): void { (window as TabWindow).hamMobileCurrentTab = id; }
  cardDesign(): { shapes: string[]; meters: string[] } { return this.hooks?.cardDesign() || { shapes: ['square'], meters: ['horizontal', 'circular'] }; }

  /** The part section's class (old core `part()`): `editable <cls> selected`. */
  partClass(id: string, cls = ''): string {
    const h = this.hooks;
    return `editable ${cls} ${h && h.selected() === id && h.highlight() ? 'selected' : ''}` + (this.hover === id ? ' ham-preview-edit-hover' : '');
  }

  /** Display URL of a media ref, as the core's `hamonymMediaFix.src` (or '' before the media service starts). */
  mediaSrc(ref: string): string { return (window as MediaWindow).hamonymMediaFix?.src?.(ref) || ''; }

  /** A Story Builder URL (old core `sbSafeUrl`): a media ref's display URL, or an http(s), image data or blob URL, else ''. */
  storyUrl(value: unknown): string {
    const u = String(value || '').trim();
    if (u.startsWith('hamonymmedia:')) return this.mediaSrc(u);
    return /^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i.test(u) ? u : '';
  }

  /** Media refs inside a value replaced with their display URL (what `safeMarkup` did to the whole page markup). */
  safe(value: unknown): string {
    const text = String(value ?? '');
    const media = (window as MediaWindow).hamonymMediaFix as { safeMarkup?(v: string): string } | undefined;
    if (media?.safeMarkup) return String(media.safeMarkup(text));
    // Before the media service starts, the core replaced every ref with a transparent image.
    return text.replace(/hamonymmedia:[a-z0-9-]+/g, 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=');
  }

  /** Called by the core at start, before it renders the page. */
  start(hooks: PartsHooks): void { this.hooks = hooks; }

  /** The slider's document handler, registered by the core where it registered it before (same listener order). */
  listen(): void { document.addEventListener('click', this.onSlideClick); }

  ngOnDestroy(): void { document.removeEventListener('click', this.onSlideClick); }

  /** The slider shows these sources; a new set starts again at the first slide. Returns the active index. */
  slide(sources: string[]): number {
    const key = sources.join('|');
    if (key !== this.slideKey) { this.slideKey = key; this.slidePosition = 0; }
    this.slidePosition %= sources.length;
    return this.slidePosition;
  }

  /** The next render starts the slider again at the first slide (slides added or removed). */
  resetSlideKey(): void { this.slideKey = ''; }

  /** Show slide `index` of a rendered Hero (old core `hamGoToHeroSlide`): the Hero renders it. */
  goToSlide(hero: Element, index: number): void {
    const images = hero.querySelectorAll('.ham-hero-slide').length;
    if (images < 2) return;
    this.slidePosition = (index + images) % images;
    this.hero?.showSlide(this.slidePosition);
  }

  /**
   * The slider arrows and dots. A document listener, as before: the preview's own handler runs
   * first (it selects the Hero in the editor and renders the page again).
   */
  private readonly onSlideClick = (e: MouseEvent): void => {
    const nav = (e.target as Element | null)?.closest?.('[data-ham-slide-nav],[data-ham-slide-dot]') as HTMLElement | null;
    if (!nav) return;
    const hero = nav.closest('.hero');
    if (!hero) return;
    const i = nav.hasAttribute('data-ham-slide-dot') ? Number(nav.dataset['hamSlideDot']) : this.slidePosition + (nav.dataset['hamSlideNav'] === 'next' ? 1 : -1);
    this.goToSlide(hero, i);
    e.preventDefault();
    e.stopPropagation();
  };
}
