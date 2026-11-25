import { ChangeDetectionStrategy, Component, Directive, ElementRef, Input, OnChanges, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SB_TYPES, StoryBuilderService } from './story-builder.service';
import { StorySlidesService } from '../public-page/parts/story-slides.service';
import { StoryNode, clamp, nodeStyle, storyColumns, storyDivider, storyEqual, storyFit, storyInline, storyRich, storySpacer, storyVpos } from '../public-page/parts/story-node';

type MediaWindow = Window & { hamonymMediaFix?: { src?(ref: string): string } };
/** Old `sbSafeUrl`. */
function safeUrl(value: unknown): string {
  const u = String(value || '').trim();
  if (u.startsWith('hamonymmedia:')) return (window as MediaWindow).hamonymMediaFix?.src?.(u) || '';
  return /^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i.test(u) ? u : '';
}

/** The value a render shows in a properties control (a new element started with it). */
@Directive({ selector: 'input[sbValue]', standalone: true })
export class StoryValueDirective implements OnChanges, OnDestroy {
  private readonly el = inject(ElementRef).nativeElement as HTMLElement;
  private readonly sb = inject(StoryBuilderService);
  @Input() sbValue: unknown = '';
  ngOnChanges(): void { this.sb.values.set(this.el, String(this.sbValue ?? '')); }
  ngOnDestroy(): void { this.sb.values.delete(this.el); }
}

/** A text node's rich text on the canvas: written on each render (content, as the markup had it), then edited by the browser. */
@Directive({ selector: '[sbRich]', standalone: true })
export class StoryRichDirective implements OnChanges {
  private readonly el = inject(ElementRef).nativeElement as HTMLElement;
  private readonly sb = inject(StoryBuilderService);
  @Input({ required: true }) sbRich = '';
  @Input() sbRichRevision = 0;
  ngOnChanges(): void { if (this.el.innerHTML !== this.sbRich) this.sb.renderer.setProperty(this.el, 'innerHTML', this.sbRich); } // legacy-dom-ok: a text block's own HTML (content)
}

/** A gallery on the canvas (old `sbRenderNode`, editing): the first image after a render, then the slideshows' slide. */
@Component({
  selector: 'div[ham-canvas-gallery]', standalone: true, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.Default,
  host: { '[attr.class]': '"sb-gallery " + (n["galleryStyle"] || "grid")', '[attr.style]': '"--sb-image-fit:" + fit()', '[attr.data-sb-seconds]': 'sb.secondsOf(n["id"], seconds())', '[attr.data-sb-slideshow]': 'slides() ? n["id"] : null' },
  template: `@for (u of images(); track $index) {<img [attr.class]="slides() && $index === index ? 'sb-gallery-active' : ''" [attr.src]="u" [attr.alt]="'תמונת גלריה ' + ($index + 1)" draggable="false">} @empty {<div class="sb-empty">הוסיפו תמונות לגלריה</div>}@if (slides() && images().length > 1) {<button type="button" class="sb-gallery-nav sb-gallery-prev" data-sb-slide="prev" aria-label="תמונה קודמת">❮</button><button type="button" class="sb-gallery-nav sb-gallery-next" data-sb-slide="next" aria-label="תמונה הבאה">❯</button><span class="sb-gallery-count">{{ index + 1 }} / {{ images().length }}</span>}`
})
export class CanvasGalleryComponent implements OnChanges, OnDestroy {
  readonly sb = inject(StoryBuilderService);
  private readonly slidesService = inject(StorySlidesService);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  @Input({ required: true }) n!: StoryNode;
  @Input() revision = 0;
  index = 0;
  constructor() { this.slidesService.register(this.host, this); }
  ngOnChanges(): void { this.index = 0; }
  images(): string[] { return (this.n['images'] || []).filter((u: unknown) => safeUrl(u)).map((u: unknown) => safeUrl(u)); }
  fit(): string { return storyFit(this.n); }
  seconds(): number { return clamp(Number(this.n['slideSeconds']) || 3.5, 0.5, 30); }
  slides(): boolean { return this.n['galleryStyle'] === 'slideshow' || this.n['galleryStyle'] === 'carousel'; }
  show(index: number): void { if (this.index === index) return; this.index = index; this.sb.refresh(); }
  ngOnDestroy(): void { this.slidesService.unregister(this.host); }
}

const TREE_DELETE = 'M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6|M10 10v7M14 10v7'.split('|');

/**
 * `#storyBuilder` (v4.54): the overlay, the palette, the tree, the canvas and the properties panel, from
 * `StoryBuilderService.view`. The ids and `data-sb-*` attributes are the old ones: the core's handlers (clicks, input,
 * drag and drop, undo / redo, uploads) still change the story and call `sbRender`.
 */
@Component({
  selector: 'ham-story-builder',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [NgTemplateOutlet, StoryValueDirective, StoryRichDirective, CanvasGalleryComponent],
  host: { '[class.open]': 'sb.isOpen' },
  template: `<header class="sb-top"><div class="sb-top-heading"><button aria-label="חזרה לעורך הקמפיין" class="sb-back" id="sbBack" type="button"><span aria-hidden="true" class="sb-back-icon">→</span><span>חזרה לעורך הקמפיין</span></button><div class="sb-heading-divider"></div><h2>סיפור הקמפיין <span style="font-weight:400;color:#7e9188">/ Story Builder</span></h2><small>בניית סיפור באמצעות תוכן ופריסות</small></div><div class="sb-top-actions"><span class="sb-status" id="sbStatus">שמירה מקומית</span><button aria-label="בטל פעולה" class="sb-button" id="sbUndo" title="בטל פעולה (Ctrl+Z)" type="button" [disabled]="sb.canUndo === null ? false : !sb.canUndo">↶</button><button aria-label="בצע שוב" class="sb-button" id="sbRedo" title="בצע שוב (Ctrl+Y)" type="button" [disabled]="sb.canRedo === null ? false : !sb.canRedo">↷</button><button class="sb-button" [class.active]="device() === 'mobile'" id="sbMobile">▯ מובייל</button><button class="sb-button" [class.active]="device() === 'desktop'" id="sbDesktop">▣ דסקטופ</button></div></header><div class="sb-layout"><aside class="sb-panel"><h3>הוספת רכיב</h3><p class="sb-help">לחצו להוספה או גררו אל הקנבס. אפשר להוסיף כמה רכיבים ברצף.</p><div class="sb-palette" id="sbPalette">@for (t of types; track t[0]) {<button #p class="sb-add" [class.sb-dragging]="sb.has(p, 'sb-dragging')" [attr.data-sb-add]="t[0]" [attr.draggable]="v() ? 'true' : null" [attr.title]="v() ? 'גררו לתוך הסיפור או לחצו להוספה' : null"><b>{{ t[2] }}</b>{{ t[1] }}</button>}</div><div class="sb-tree"><h3>מבנה הסיפור</h3><div #tree id="sbTree" [class.sb-drop-inside]="sb.has(tree, 'sb-drop-inside')">@if (v(); as view) {<ng-container *ngTemplateOutlet="rows; context: { $implicit: view.nodes, depth: 0 }"></ng-container>}</div><button class="sb-button sb-danger sb-clear-story" id="sbClearStory" type="button">🗑 נקה את כל הסיפור</button></div></aside><div class="sb-canvas-wrap"><div #canvas [class]="'sb-canvas ' + device()" dir="rtl" id="sbCanvas" [class.sb-drop-inside]="sb.has(canvas, 'sb-drop-inside')" [style.font-family]="v() ? font() : null">@if (v(); as view) {@if (view.nodes.length) {<ng-container *ngTemplateOutlet="nodes; context: { $implicit: view.nodes }"></ng-container>} @else {<div class="sb-empty">התחילו בהוספת רכיב לסיפור</div>}<div #end class="sb-drop-end" [class.sb-drop-inside]="sb.has(end, 'sb-drop-inside')" data-sb-drop-end="1">＋ גררו לכאן רכיב נוסף</div>}</div></div><aside class="sb-panel"><h3>מאפייני הרכיב</h3><div id="sbProps">@if (!v()) {<p class="sb-help">בחר רכיב בסיפור כדי לערוך אותו.</p>} @else {@if (found(); as f) {<ng-container *ngTemplateOutlet="props; context: { $implicit: f.n, parent: f.parent, x: style(f.n) }"></ng-container>} @else {<p class="sb-help">בחרו רכיב מתוך הקנבס או מעץ הסיפור.</p>}}</div></aside></div>

<ng-template #rows let-list let-depth="depth">@for (n of list; track $index) {<div #row class="sb-tree-row" [class.selected]="v()!.selected === n.id" [class.sb-dragging]="sb.has(row, 'sb-dragging')" [class.sb-drop-before]="sb.has(row, 'sb-drop-before')" [class.sb-drop-after]="sb.has(row, 'sb-drop-after')" [class.sb-drop-inside]="sb.has(row, 'sb-drop-inside')" [attr.data-sb-pick]="n.id" [attr.style]="'padding-right:' + (depth * 13 + 4) + 'px'" draggable="true" title="גררו לשינוי סדר או לתוך קונטיינר"><span>{{ icon(n) }}</span><span class="sb-tree-label">{{ label(n) }}</span><button title="למעלה" data-sb-move="up" [attr.data-id]="n.id">↑</button><button title="למטה" data-sb-move="down" [attr.data-id]="n.id">↓</button><button title="העבר לתוך הקונטיינר שמעל" [attr.data-sb-nest]="n.id">↳</button><button title="הוצא מהקונטיינר" [attr.data-sb-out]="n.id">↰</button><button type="button" title="מחק רכיב" aria-label="מחק רכיב" [attr.data-sb-tree-delete]="n.id"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">@for (d of trash; track $index) {<path [attr.d]="d"/>}</svg></button></div>@if (n.children?.length) {<ng-container *ngTemplateOutlet="rows; context: { $implicit: n.children, depth: depth + 1 }"></ng-container>}}</ng-template>

<ng-template #nodes let-list>@for (n of list; track $index) {<div #node [class]="'sb-node ' + (v()!.selected === n.id ? 'selected' : '') + ' ' + ((n.type || 'text') === 'image' && n.imageFit === 'fill' ? 'sb-image-stretch' : '')" [class.sb-dragging]="sb.has(node, 'sb-dragging')" [class.sb-drop-before]="sb.has(node, 'sb-drop-before')" [class.sb-drop-after]="sb.has(node, 'sb-drop-after')" [class.sb-drop-inside]="sb.has(node, 'sb-drop-inside')" [attr.data-sb-node]="n.id" [attr.style]="sb.style(n.id, inline(n))" draggable="true" title="גררו למיקום אחר בסיפור"><span class="sb-node-toolbar">{{ typeLabel(n) }}</span>@switch (n.type || 'text') {
@case ('text') {<div class="sb-rich" contenteditable="true" [attr.data-sb-edit]="n.id" [sbRich]="richHtml(n)" [sbRichRevision]="sb.revision"></div>}
@case ('image') {@if (url(n.value); as src) {<div class="sb-image-frame" [attr.style]="'--image-fit:' + fit(n)"><img class="sb-image" [attr.style]="'object-fit:' + fit(n) + ';object-position:center ' + vpos(n) + '%'" [attr.src]="src" alt="תמונת סיפור" draggable="false"></div>} @else {<div class="sb-empty">בחרו תמונה במאפיינים</div>}}
@case ('gallery') {<div ham-canvas-gallery [n]="n" [revision]="sb.revision"></div>}
@case ('video') {@if (url(n.value); as src) {<video class="sb-video" controls preload="metadata" [attr.src]="src"></video>} @else {<div class="sb-empty">הוסיפו כתובת MP4 או WebM</div>}}
@case ('divider') {<hr class="sb-divider" [attr.style]="divider(n)">}
@case ('spacer') {<div class="sb-spacer" [attr.style]="'height:' + spacer(n) + 'px'"></div>}
@case ('container') {<div [attr.class]="'sb-grid cols-' + (n.layout || '2') + ' ' + (equal(n) ? 'sb-equal-height' : '')" [attr.style]="columns(n)">@if (n.children?.length) {<ng-container *ngTemplateOutlet="nodes; context: { $implicit: n.children }"></ng-container>} @else {<div class="sb-empty">בחרו את הקונטיינר והוסיפו אליו רכיב</div>}</div>}
}</div>}</ng-template>

<ng-template #range let-key="key" let-label="label" let-value="value"><label class="sb-field sb-range-field"><span class="sb-range-heading">{{ label }}<output #o [attr.data-sb-output]="key">{{ sb.t(o, (num(value) || 0) + ' px') }}</output></span><input [attr.data-sb-style]="key" type="range" [attr.min]="key === 'margin' ? -100 : 0" [attr.max]="max(key)" step="1" [sbValue]="num(value) || 0"><span class="sb-range-ends"><small>{{ key === 'margin' ? '−100' : '0' }}</small><small>{{ max(key) }}</small></span></label></ng-template>
<ng-template #color let-key="key" let-label="label" let-value="value"><label class="sb-field">{{ label }}<input [attr.data-sb-style]="key" type="color" [sbValue]="value ?? ''"></label></ng-template>
<ng-template #choice let-key="key" let-label="label" let-options="options" let-value="value" let-styled="styled"><span class="sb-choice-label">{{ label }}</span><div class="sb-choice" [attr.style]="'--choice-cols:' + options.length" role="group" [attr.aria-label]="label">@for (o of options; track o[0]) {<button type="button" [class.active]="value === o[0]" [attr.data-sb-choice]="key" [attr.data-sb-choice-value]="o[0]" [attr.data-sb-choice-style]="styled ? '1' : null" [attr.aria-pressed]="(value === o[0]) + ''">{{ o[1] }}</button>}</div></ng-template>

<ng-template #props let-n let-parent="parent" let-x="x"><p class="sb-help">{{ typeLabel(n, 'רכיב') }} · עיצוב עבור {{ device() === 'mobile' ? 'מובייל' : 'דסקטופ' }}</p>@if (n.type === 'text') {<div class="sb-heading-tools" role="group" aria-label="סגנון פסקה"><span class="sb-heading-label">סוג טקסט</span><div class="sb-heading-buttons"><button type="button" data-sb-heading="p" title="פסקה רגילה">רגיל</button><button type="button" data-sb-heading="h1" title="כותרת ראשית">H1</button><button type="button" data-sb-heading="h2" title="כותרת משנית">H2</button><button type="button" data-sb-heading="h3" title="כותרת קטנה">H3</button></div></div><div class="sb-format"><button data-sb-format="bold"><b>B</b></button><button data-sb-format="italic"><i>I</i></button><button data-sb-format="underline"><u>U</u></button><button data-sb-format="insertUnorderedList">☷</button><button data-sb-format="justifyRight">⇥</button><button data-sb-format="justifyCenter">≡</button><button data-sb-format="justifyFull">☰</button><button data-sb-format="createLink">🔗</button></div><p class="sb-help">לחצו על הטקסט בקנבס כדי לערוך אותו ישירות. הסרגל פועל על הטקסט המסומן.</p>}
@if (n.type === 'image' && parent?.type === 'container') {<div class="sb-action-group"><button type="button" class="sb-button" data-sb-wrap-image>▤ הוסף קונטיינר סביב התמונה (לעמודה זו)</button><p class="sb-help">התמונה תישאר במקומה. בתוך הקונטיינר החדש אפשר להוסיף תמונה שנייה ולבחור פריסה של שורות או עמודות.</p></div>}
@if (n.type === 'image' || n.type === 'video') {<label class="sb-field">כתובת {{ n.type === 'image' ? 'התמונה' : 'הווידאו (MP4/WebM)' }}<input data-sb-value [sbValue]="n.value || ''"></label><label class="sb-field">או העלאת קובץ<span class="sb-file-picker"><input type="file" data-sb-upload [attr.accept]="n.type === 'image' ? 'image/png,image/jpeg,image/webp' : 'video/mp4,video/webm'" [sbValue]="''"><span class="sb-file-cta"><span class="sb-upload-icon">↥</span><span>בחרו {{ n.type === 'image' ? 'תמונה' : 'סרטון' }} מהמחשב</span><span class="sb-upload-arrow">‹</span></span></span></label>}
@if (n.type === 'gallery') {<ng-container *ngTemplateOutlet="choice; context: { key: 'galleryStyle', label: 'סגנון גלריה', options: galleryStyles, value: n.galleryStyle || 'slideshow' }"></ng-container><label class="sb-field">הוספת תמונות<span class="sb-file-picker"><input type="file" data-sb-gallery-upload accept="image/png,image/jpeg,image/webp" multiple [sbValue]="''"><span class="sb-file-cta"><span class="sb-upload-icon">▧</span><span>בחרו תמונות לגלריה</span><span class="sb-upload-arrow">‹</span></span></span></label><p class="sb-help">{{ (n.images || []).length }} תמונות בגלריה</p><button class="sb-button" data-sb-clear-gallery>נקה גלריה</button>}
@if (n.type === 'image' || n.type === 'gallery') {<ng-container *ngTemplateOutlet="choice; context: { key: 'imageFit', label: 'התאמת תמונה לתיבה', options: fits, value: n.imageFit || 'cover' }"></ng-container>}
@if (n.type === 'image') {<label class="sb-field sb-range-field"><span class="sb-range-heading">מיקום תמונה בגובה העמודה<output #o data-sb-output="imageVerticalPosition">{{ sb.t(o, vpos(n) + '%') }}</output></span><input data-sb-style="imageVerticalPosition" type="range" min="0" max="100" step="1" [sbValue]="vpos(n)"><span class="sb-range-ends"><small>למעלה · 0%</small><small>למטה · 100%</small></span></label><p class="sb-help">כאשר התמונה קטנה מגובה העמודה, הסליידר מזיז אותה למעלה או למטה. במצב גובה אחיד הוא משנה את אזור התמונה שמוצג בחיתוך.</p>}
@if (n.type === 'gallery') {<label class="sb-field sb-range-field"><span class="sb-range-heading">זמן בין תמונות<output #o data-sb-output="slideSeconds">{{ sb.t(o, (num(n.slideSeconds) || 3.5) + ' שניות') }}</output></span><input data-sb-property-range="slideSeconds" type="range" min="0.5" max="30" step="0.5" [sbValue]="num(n.slideSeconds) || 3.5"><span class="sb-range-ends"><small>0.5 שניות</small><small>30 שניות</small></span></label>}
@if (n.type === 'container') {<ng-container *ngTemplateOutlet="choice; context: { key: 'layout', label: 'חלוקת עמודות', options: layouts, value: n.layout || '2' }"></ng-container><ng-container *ngTemplateOutlet="choice; context: { key: 'mobileLayout', label: 'פריסה במובייל', options: mobileLayouts, value: n.mobileLayout || 'stack' }"></ng-container><div class="sb-action-group"><button class="sb-button sb-swap" data-sb-swap-columns [disabled]="$any(n.children)?.length < 2">⇄ החלף בין העמודה הימנית לשמאלית</button><button class="sb-button sb-add-inner" data-sb-add-inside>＋ הוסף לתוך הקונטיינר</button></div><div class="sb-inside-picker" id="sbInsidePicker" [hidden]="sb.picker.hidden">@if (sb.picker.filled) {<p class="sb-help">בחרו רכיב להוספה בתוך הקונטיינר:</p>@for (t of types; track t[0]) {<button type="button" class="sb-button" [attr.data-sb-insert-type]="t[0]">{{ t[2] }} {{ t[1] }}</button>}}</div><p class="sb-help">במובייל אפשר לשמור על עמודות או לערום בשורות.</p>}
@if (n.type === 'divider') {<label class="sb-field sb-range-field"><span class="sb-range-heading">רוחב הקו<output #o1 data-sb-output="dividerWidth">{{ sb.t(o1, dividerWidth(x) + '%') }}</output></span><input data-sb-style="dividerWidth" type="range" min="5" max="100" step="1" [sbValue]="dividerWidth(x)"><span class="sb-range-ends"><small>5% · קצר</small><small>100% · רוחב מלא</small></span></label><p class="sb-help">הקו ממורכז בתוך הרכיב. ניתן להגדיר רוחב שונה למובייל ולדסקטופ.</p><label class="sb-field sb-range-field"><span class="sb-range-heading">עובי הקו<output #o2 data-sb-output="dividerThickness">{{ sb.t(o2, dividerThickness(x) + ' px') }}</output></span><input data-sb-style="dividerThickness" type="range" min="1" max="20" step="1" [sbValue]="dividerThickness(x)"><span class="sb-range-ends"><small>1px · דק</small><small>20px · עבה</small></span></label>}
@if (n.type === 'spacer') {<ng-container *ngTemplateOutlet="range; context: { key: 'height', label: 'גובה המרווח', value: x.height ?? n.height ?? 24 }"></ng-container>}
<hr style="border:0;border-top:1px solid #e6ece8;margin:16px 0"><h3>עיצוב ומרווחים</h3><div class="sb-field-row"><ng-container *ngTemplateOutlet="range; context: { key: 'padding', label: 'Padding', value: x.padding || 0 }"></ng-container><ng-container *ngTemplateOutlet="range; context: { key: 'margin', label: 'Margin', value: x.margin || 0 }"></ng-container></div>
@if (n.type === 'container') {<ng-container *ngTemplateOutlet="choice; context: { key: 'equalHeight', label: 'התאמת גובה בין האלמנטים', options: heights, value: x.equalHeight || 'no', styled: true }"></ng-container><p class="sb-help">הגדרה נפרדת למובייל ולדסקטופ. במובייל חלה בפריסת עמודות.</p><ng-container *ngTemplateOutlet="range; context: { key: 'borderWidth', label: 'עובי מסגרת', value: x.borderWidth ?? 0 }"></ng-container><label class="sb-field">צבע מסגרת<input type="color" data-sb-style="borderColor" [sbValue]="borderColor(x)"></label><ng-container *ngTemplateOutlet="range; context: { key: 'borderRadius', label: 'עיגול פינות', value: x.borderRadius ?? 0 }"></ng-container>}
@if (n.type === 'text') {<label class="sb-field sb-range-field"><span class="sb-range-heading">מרווח בין שורות<output #o data-sb-output="lineHeight">{{ sb.t(o, lineHeight(x).toFixed(2)) }}</output></span><input data-sb-style="lineHeight" type="range" min="0.8" max="2.5" step="0.05" [sbValue]="lineHeight(x)"><span class="sb-range-ends"><small>0.8 · כמעט צמוד</small><small>2.5 · מרווח</small></span></label><ng-container *ngTemplateOutlet="range; context: { key: 'fontSize', label: 'גודל גופן', value: x.fontSize || 16 }"></ng-container><ng-container *ngTemplateOutlet="choice; context: { key: 'align', label: 'יישור טקסט', options: aligns, value: x.align || 'right', styled: true }"></ng-container>}
<div class="sb-field-row"><ng-container *ngTemplateOutlet="color; context: { key: 'color', label: 'צבע טקסט', value: x.color || '#253e35' }"></ng-container><ng-container *ngTemplateOutlet="color; context: { key: 'background', label: 'צבע רקע', value: x.background || '#ffffff' }"></ng-container></div><div class="sb-action-stack"><button class="sb-button" data-sb-duplicate>שכפל רכיב</button><button class="sb-button sb-danger" data-sb-delete>מחק רכיב</button></div></ng-template>`
})
export class StoryBuilderComponent {
  readonly sb = inject(StoryBuilderService);
  readonly types = Object.entries(SB_TYPES).map(([type, [label, icon]]) => [type, label, icon]);
  readonly trash = TREE_DELETE;
  readonly galleryStyles = [['grid', 'רשת'], ['carousel', 'קרוסלה'], ['slideshow', 'מצגת']];
  readonly fits = [['cover', 'מילוי וחיתוך'], ['contain', 'תמונה מלאה'], ['fill', 'מתיחה מלאה']];
  readonly layouts = [['1', 'אחת'], ['2', 'שתיים'], ['3', 'שלוש']];
  readonly mobileLayouts = [['stack', 'שורות'], ['columns', 'עמודות']];
  readonly heights = [['no', 'גובה טבעי'], ['yes', 'גובה אחיד']];
  readonly aligns = [['right', 'ימין'], ['center', 'מרכז'], ['justify', 'מיושר'], ['left', 'שמאל']];

  v() { return this.sb.view; }
  device(): string { return this.sb.view?.device || 'mobile'; }
  font(): string { return `'${this.sb.view?.font || 'Heebo'}',Arial,sans-serif`; }
  /** Old `sbFind` on the render's copy: the selected node and its parent. */
  found(): { n: StoryNode; parent: StoryNode | null } | null {
    const id = this.sb.view?.selected;
    if (!id) return null;
    const find = (items: StoryNode[], parent: StoryNode | null): { n: StoryNode; parent: StoryNode | null } | null => {
      for (const n of items) { if (n['id'] === id) return { n, parent }; if (n['children']) { const f = find(n['children'], n); if (f) return f; } }
      return null;
    };
    return find(this.sb.view!.nodes, null);
  }
  style(n: StoryNode): StoryNode { return nodeStyle(n, this.device()); }
  icon(n: StoryNode): string { return SB_TYPES[n['type']]?.[1] || 'T'; }
  label(n: StoryNode): string { return SB_TYPES[n['type']]?.[0] || 'טקסט'; }
  typeLabel(n: StoryNode, fallback?: string): string { const type = n['type'] || 'text'; return SB_TYPES[type]?.[0] || fallback || type; }
  /** The text node's markup as the old canvas wrote it: the rich HTML, or the plain text escaped. */
  richHtml(n: StoryNode): string { return storyRich(n) ? n['value'] : String(n['value'] || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]); }
  url(u: unknown): string { return safeUrl(u); }
  fit(n: StoryNode): string { return storyFit(n); }
  vpos(n: StoryNode): number { return storyVpos(n, this.device()); }
  spacer(n: StoryNode): number { return storySpacer(n, this.device()); }
  divider(n: StoryNode): string { return storyDivider(n, this.device()); }
  equal(n: StoryNode): boolean { return storyEqual(n, this.device()); }
  columns(n: StoryNode): string | null { return storyColumns(n, this.device()); }
  inline(n: StoryNode): string { return storyInline(n, this.device()); }
  num(v: unknown): number { return Number(v); }
  max(key: string): number { return key === 'fontSize' ? 96 : key === 'height' ? 320 : 160; }
  dividerWidth(x: StoryNode): number { return clamp(Number(x['dividerWidth'] ?? 100), 5, 100); }
  dividerThickness(x: StoryNode): number { return clamp(Number(x['dividerThickness'] ?? 1), 1, 20); }
  lineHeight(x: StoryNode): number { return Number(x['lineHeight'] ?? 1.75); }
  borderColor(x: StoryNode): string { return /^#[0-9a-fA-F]{6}$/.test(x['borderColor'] || '') ? x['borderColor'] : '#d4ded9'; }
}
