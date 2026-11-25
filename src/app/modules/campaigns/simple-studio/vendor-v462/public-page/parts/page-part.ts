import { ChangeDetectorRef, Directive, DoCheck, ElementRef, Input, OnChanges, Renderer2, inject } from '@angular/core';
import { PublicPartsService } from './public-parts.service';

/**
 * A component of the public page that is rendered again in place (v4.53).
 *
 * Until v4.52 every `renderPreview` created a new PublicPageComponent, so each part computed what it shows
 * once, in its constructor. Since v4.53 the page is created once and updated: a render increments
 * `PublicPartsService.revision`, and when the page is checked each part sees the new revision (`ngDoCheck`,
 * which Angular calls on a child before it checks the child's view), computes again (`render`) and marks
 * itself for check, so the same pass updates its template. A part also resets there what a new element
 * started without (a playing video, an open menu, a selected amount): what a render reset before.
 *
 * A subclass computes its first state in its constructor or `ngOnInit` (with its inputs) by calling
 * `render()` itself.
 */
@Directive()
export abstract class PagePart implements DoCheck {
  readonly parts = inject(PublicPartsService);
  protected readonly cdr = inject(ChangeDetectorRef);
  private renderedAt = this.parts.revision;

  ngDoCheck(): void {
    if (this.renderedAt === this.parts.revision) return;
    this.renderedAt = this.parts.revision;
    this.render();
    this.cdr.markForCheck();
  }

  /**
   * After a change of the part's own state: its template, and its host's bindings (they are its parent's, the
   * page's view). Outside the page (a card rendered to markup) only its template.
   */
  protected update(): void {
    this.cdr.markForCheck();
    if (this.parts.page) this.parts.page.check(); else this.cdr.detectChanges();
  }

  /** Compute what the part shows from the campaign and the editor state, and reset its transient state. */
  protected abstract render(): void;
}

/**
 * A field of the page that a render shows again with its bound value (v4.53): what the user typed is dropped
 * on each page render, as a new element started empty before. Written through Renderer2.
 */
@Directive({ selector: 'input[hamPageValue],textarea[hamPageValue]', standalone: true })
export class PageValueDirective extends PagePart implements OnChanges {
  private readonly el = inject(ElementRef<HTMLInputElement>).nativeElement as HTMLInputElement;
  private readonly renderer = inject(Renderer2);
  @Input() hamPageValue: unknown = '';
  ngOnChanges(): void { this.render(); }
  protected render(): void {
    const value = String(this.hamPageValue ?? '');
    if (this.el.value !== value) this.renderer.setProperty(this.el, 'value', value);
  }
}
