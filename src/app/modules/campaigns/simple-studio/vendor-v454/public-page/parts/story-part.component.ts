import { ChangeDetectionStrategy, Component, Directive, ElementRef, Input, OnChanges, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CardData } from '../cards/card-format';
import { PagePart } from './page-part';
import { StorySlidesService } from './story-slides.service';
import { clamp, storyColumns, storyDivider, storyEqual, storyFit, storyInline, storyRich, storySpacer, storyVpos } from './story-node';

type Node = CardData;
const fit = storyFit;

/**
 * A text block's own markup (the Story Builder's rich text: the manager's HTML, media refs resolved). It is
 * content, written as the old page markup wrote it (not through Angular's sanitizer, which would change it).
 */
@Directive({ selector: '[hamStoryHtml]', standalone: true })
export class StoryHtmlDirective implements OnChanges {
  private readonly el = inject(ElementRef<HTMLElement>);
  @Input({ required: true }) hamStoryHtml = '';
  ngOnChanges(): void { this.el.nativeElement.innerHTML = this.hamStoryHtml; } // legacy-dom-ok: a text block's own HTML (content)
}

/**
 * A gallery of the story (old `sbRenderNode`, type `gallery`): grid, slideshow or carousel. A slideshow and a
 * carousel show one image at a time and its count; the slide is StorySlidesService's (by the block's id), which
 * asks the gallery to show it (`show`) instead of changing its DOM (v4.51).
 */
@Component({
  selector: 'div[ham-story-gallery]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': '"sb-gallery " + (n["galleryStyle"] || "grid")', '[attr.style]': '"--sb-image-fit:" + fit', '[attr.data-sb-seconds]': 'seconds', '[attr.data-sb-slideshow]': 'slides ? n["id"] : null' },
  template: `@for (u of images; track $index) {<img [attr.class]="slides && $index === index ? 'sb-gallery-active' : ''" [attr.src]="u" [attr.alt]="'תמונת גלריה ' + ($index + 1)">} @empty {<div class="sb-empty">הוסיפו תמונות לגלריה</div>}@if (slides && images.length > 1) {<button type="button" class="sb-gallery-nav sb-gallery-prev" data-sb-slide="prev" aria-label="תמונה קודמת">❮</button><button type="button" class="sb-gallery-nav sb-gallery-next" data-sb-slide="next" aria-label="תמונה הבאה">❯</button><span class="sb-gallery-count">{{ index + 1 }} / {{ images.length }}</span>}`
})
export class StoryGalleryComponent extends PagePart implements OnChanges, OnDestroy {
  private readonly slidesService = inject(StorySlidesService);
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  @Input({ required: true }) n!: Node;
  images: string[] = [];
  fit = 'cover';
  seconds = 3.5;
  slides = false;
  /** The image shown (the markup showed the first; the service shows the gallery's slide). */
  index = 0;

  constructor() { super(); this.slidesService.register(this.host, this); }
  /**
   * v4.53: a page render shows the first image again (a new gallery did); the slideshows' service then shows the
   * slide it keeps (`sbInitSlides`), and forgets the carousels' (KNOWN_ISSUES #7, kept).
   */
  protected render(): void { this.index = 0; this.ngOnChanges(); }
  ngOnChanges(): void {
    const n = this.n;
    this.images = (n['images'] || []).map((u: unknown) => this.parts.storyUrl(u)).filter((u: string) => u);
    this.fit = fit(n);
    this.seconds = clamp(Number(n['slideSeconds']) || 3.5, 0.5, 30);
    this.slides = n['galleryStyle'] === 'slideshow' || n['galleryStyle'] === 'carousel';
  }
  show(index: number): void { if (this.index === index) return; this.index = index; this.cdr.detectChanges(); }
  ngOnDestroy(): void { this.slidesService.unregister(this.host); }
}

/**
 * The campaign story (old core `renderPreview`, part `story`): its heading and the Story Builder's blocks. On a
 * phone a "menu-only" story gets the core's `menu-only-*` classes (`cls`).
 *
 * v4.51: the blocks are this template's (old `storyRenderPublic` / `sbRenderNode` without editing, written as
 * markup after the heading): text, image, gallery, video, divider, spacer and containers (nested), each with
 * the device's style. Media refs are resolved as the page markup had them (`safe`, `storyUrl`).
 */
@Component({
  selector: 'section[ham-story-part]',
  standalone: true,
  imports: [NgTemplateOutlet, StoryGalleryComponent, StoryHtmlDirective],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': 'parts.partClass("story", cls)', 'data-part': 'story' },
  template: `<ng-template #nodes let-list>@for (n of list; track $index) {<div [attr.class]="'story-block ' + (n.type === 'image' && n.imageFit === 'fill' ? 'sb-image-stretch' : '')" [attr.data-sb-story-id]="n.id" [attr.style]="inline(n)">@switch (n.type || 'text') {
  @case ('text') {@if (rich(n)) {<div class="sb-rich" [hamStoryHtml]="parts.safe(n.value)"></div>} @else {<div class="sb-rich">{{ n.value || '' }}</div>}}
  @case ('image') {@if (url(n.value); as src) {<div class="sb-image-frame" [attr.style]="'--image-fit:' + fit(n)"><img class="sb-image" [attr.style]="'object-fit:' + fit(n) + ';object-position:center ' + vpos(n) + '%'" [attr.src]="src" alt="תמונת סיפור"></div>} @else {<div class="sb-empty">בחרו תמונה במאפיינים</div>}}
  @case ('gallery') {<div ham-story-gallery [n]="n"></div>}
  @case ('video') {@if (url(n.value); as src) {<video class="sb-video" controls preload="metadata" [attr.src]="src"></video>} @else {<div class="sb-empty">הוסיפו כתובת MP4 או WebM</div>}}
  @case ('divider') {<hr class="sb-divider" [attr.style]="divider(n)">}
  @case ('spacer') {<div class="sb-spacer" [attr.style]="'height:' + spacer(n) + 'px'"></div>}
  @case ('container') {<div [attr.class]="'sb-grid cols-' + (n.layout || '2') + ' ' + (equal(n) ? 'sb-equal-height' : '')" [attr.style]="columns(n)">@if (n.children?.length) {<ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }" />} @else {<div class="sb-empty">בחרו את הקונטיינר והוסיפו אליו רכיב</div>}</div>}
}</div>}</ng-template>@if (article) {<div class="ham-story-current-tab"><span class="ham-story-tab-label" aria-current="page">הסיפור</span></div>}<div class="story">@if (s['heading']) {<h2 class="block-heading">{{ text(s['heading']) }}</h2>}<ng-container *ngTemplateOutlet="nodes; context: { $implicit: blocks }" /></div>`
})
export class StoryPartComponent extends PagePart {
  @Input() cls = '';

  s!: CardData;
  blocks: Node[] = [];
  private device = '';
  /** On a desktop panorama the story is the article card under the tabs, with its tab label (v4.47). */
  article = false;

  constructor() { super(); this.render(); }

  protected render(): void {
    this.s = this.parts.campaign['content'].story;
    this.blocks = this.s['blocks'] || [];
    this.device = this.parts.device();
    this.article = this.parts.layout.storyArticle;
  }

  // v4.54: the node's presentation is story-node.ts, shared with the Story Builder's canvas.
  rich(n: Node): boolean { return storyRich(n); }
  url(u: unknown): string { return this.parts.storyUrl(u); }
  fit(n: Node): string { return storyFit(n); }
  vpos(n: Node): number { return storyVpos(n, this.device); }
  spacer(n: Node): number { return storySpacer(n, this.device); }
  divider(n: Node): string { return storyDivider(n, this.device); }
  equal(n: Node): boolean { return storyEqual(n, this.device); }
  columns(n: Node): string | null { return storyColumns(n, this.device); }
  /** Old `sbInline` (the block's style on this device), media refs resolved as in the page markup. */
  inline(n: Node): string { return this.parts.safe(storyInline(n, this.device)); }
  text(v: unknown): string { return String(v ?? ''); }
}
