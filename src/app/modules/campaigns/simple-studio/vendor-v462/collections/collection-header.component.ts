import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, output } from '@angular/core';

export type CollectionView = 'grid' | 'list' | 'carousel';

const VIEW_LABEL: Record<CollectionView, string> = { grid: 'גריד', list: 'שורות', carousel: 'קרוסלה' };

/**
 * Header of a public collection (old `HamonymCollection.header()`): heading, view switcher,
 * optional filters (projected) and subtitle. Same classes as the original.
 *
 * v4.45: an attribute component on the header's own `<div class="hc-header">` (no wrapper element),
 * shared by the collection blocks of the public page and the race participants list.
 */
@Component({
  selector: 'div[ham-collection-header]',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hc-header' },
  template: `
<div class="hc-header-line">
  <strong class="hc-heading" [attr.style]="headingStyle()">{{ heading() }}</strong>
  <div class="hc-view-buttons" role="group" aria-label="בחירת תצוגה">
    @for (key of views; track key) {
      <button type="button" [attr.data-hc-view]="key" [attr.aria-label]="label[key]" [attr.title]="label[key]"
        [attr.aria-pressed]="view() === key" class="hc-view-btn" [class.is-active]="view() === key" (click)="select($event, key)">
        @switch (key) {
          @case ('grid') { <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
          @case ('list') { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h2M3 12h2M3 18h2"/></svg> }
          @case ('carousel') { <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M2 7v10M22 7v10"/></svg> }
        }
      </button>
    }
  </div>
</div>
@if (hasFilters()) { <div class="hc-filter-line"><ng-content /></div> }
@if (subtitle()) { <small class="hc-subtitle">{{ subtitle() }}</small> }`
})
export class CollectionHeaderComponent {
  readonly heading = input('תורמים');
  /** Inline style of the heading (the rewards block styles its heading from the inspector). */
  readonly headingStyle = input<string | null>(null);
  readonly view = input<CollectionView>('grid');
  readonly subtitle = input('');
  readonly hasFilters = input(false);
  readonly viewChange = output<CollectionView>();
  readonly views: CollectionView[] = ['grid', 'list', 'carousel'];
  readonly label = VIEW_LABEL;

  select(event: Event, key: CollectionView): void {
    // The click selects a view only: it must not reach the preview's block selection.
    event.preventDefault();
    event.stopPropagation();
    this.viewChange.emit(key);
  }
}
