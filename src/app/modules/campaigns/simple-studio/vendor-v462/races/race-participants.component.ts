import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { PagePart } from '../public-page/parts/page-part';
import { CollectionBlocksService } from '../public-page/collections/collection-blocks.service';
import { CollectionHeaderComponent, CollectionView } from '../collections/collection-header.component';
import { CollectionCarouselComponent } from '../collections/collection-carousel.component';
import { AGE_OPTIONS, AgeBucket, RaceParticipant, RaceStateService, ageBucket } from './race-state.service';

/** Filters and view mode are shared by every participants list on the page. */
export const participantsUi = {
  view: signal<CollectionView>('grid'),
  term: signal(''),
  heat: signal<'all' | string>('all'),
  age: signal<AgeBucket>('all')
};

/**
 * Public list of race participants (search, heat and age filters, grid/list/carousel). v4.49: part of the
 * page's template (old RaceFlowService mounted it after each render, attached to the application), so it
 * renders its own changes; the page is rendered again when the campaign changes.
 */
@Component({
  selector: 'ham-race-participants',
  standalone: true,
  imports: [CollectionHeaderComponent, CollectionCarouselComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
<section #root class="ham-race-participants hc-public-collection hc-collection" [attr.data-hc-mode]="ui.view()" data-ham-participants dir="rtl">
  <div ham-collection-header [heading]="'משתתפים'" [view]="ui.view()" [hasFilters]="true" (viewChange)="set(ui.view, $event)">
    <div class="ham-participant-filters">
      <input type="search" aria-label="חיפוש משתתף" placeholder="חיפוש משתתף..." [value]="ui.term()" (input)="set(ui.term, $any($event.target).value)">
      <select aria-label="סינון לפי מקצה" (change)="set(ui.heat, $any($event.target).value)">
        <option value="all" [selected]="ui.heat() === 'all'">כל המקצים</option>
        @for (h of heats(); track $index) { <option [value]="$index" [selected]="ui.heat() === '' + $index">{{ h.title || 'מקצה ' + ($index + 1) }}</option> }
      </select>
      <select aria-label="סינון קבוצות גיל" (change)="set(ui.age, $any($event.target).value)">
        @for (o of ageOptions; track o[0]) { <option [value]="o[0]" [selected]="ui.age() === o[0]">{{ o[1] }}</option> }
      </select>
    </div>
  </div>
  <div class="ham-participant-total">{{ list().length }} משתתפים{{ demoMode() ? ' · נתוני המחשה בלבד' : '' }}</div>
  <div #track class="hc-items">
    @for (p of list(); track $index) {
      <article class="hc-card ham-participant-card" dir="rtl">
        <span class="ham-participant-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3.6-8 8-8s8 3 8 8"/></svg></span>
        <span class="ham-participant-copy"><strong>{{ p.name || 'משתתף' }}</strong><small>{{ race.heatName(p) }}</small></span>
      </article>
    } @empty {
      <p class="ham-participant-empty">לא נמצאו משתתפים לפי הסינון.</p>
    }
  </div>
  <ham-collection-carousel [track]="track" [active]="ui.view() === 'carousel'" [ready]="ready()" />
</section>`
})
export class RaceParticipantsComponent extends PagePart implements AfterViewInit, OnDestroy {
  readonly race = inject(RaceStateService);
  readonly ui = participantsUi;
  readonly ageOptions = AGE_OPTIONS;
  private readonly blocks = inject(CollectionBlocksService);
  @ViewChild('root') private root?: ElementRef<HTMLElement>;
  /**
   * v4.53: the carousel global ran on this list since the page render (the old function marked the nav it found,
   * `data-hc-ready`, 30 ms after a new list was inserted); a render starts again without it.
   */
  readonly ready = signal(false);

  ngAfterViewInit(): void { if (this.root) this.blocks.own(this.root.nativeElement, { syncCarousel: () => { this.ready.set(true); this.cdr.detectChanges(); }, hideMenu: () => {} }); }
  ngOnDestroy(): void { if (this.root) this.blocks.release(this.root.nativeElement); }
  protected render(): void { this.ready.set(false); }

  set<T>(state: { set(value: T): void }, value: T): void { state.set(value); this.cdr.detectChanges(); }

  readonly heats = computed(() => { this.race.version(); return this.race.heats(); });
  readonly demoMode = computed(() => { this.race.version(); return this.race.participants().length === 0; });
  readonly list = computed<RaceParticipant[]>(() => {
    this.race.version();
    const q = this.ui.term().trim().toLocaleLowerCase('he');
    const heat = this.ui.heat(), age = this.ui.age();
    return this.race.displayParticipants().filter(p =>
      (heat === 'all' || Number(p.heat) === Number(heat)) &&
      (age === 'all' || ageBucket(p.age) === age) &&
      (!q || String(p.name || '').toLocaleLowerCase('he').includes(q)));
  });
}
