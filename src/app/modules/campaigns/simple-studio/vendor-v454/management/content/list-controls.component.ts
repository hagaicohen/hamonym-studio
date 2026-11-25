import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject, signal } from '@angular/core';

export type SortChoice = [id: string, label: string];

export const COLLECTION_SORTS: SortChoice[] = [['original', 'סדר מקורי'], ['name', 'שם א–ת'], ['reverse', 'חדש תחילה']];
export const incomingSorts = (comments: boolean): SortChoice[] =>
  [['newest', 'חדש תחילה'], ['oldest', 'ישן תחילה'], ['name', 'שם א–ת'], ...(comments ? [['pending', 'ממתינות תחילה'], ['approved', 'מאושרות תחילה']] as SortChoice[] : [])];

/** Open sort popups of the management screen: opening one closes the others (old `huCloseSortControls`). */
const controls = new Set<ListControlsComponent>();
const closeAll = (): void => controls.forEach(c => c.close());

/**
 * Search box and styled sort menu of a manager list (old engine `huSharedListControls`,
 * `huSyncSortControl` and the document sort handlers). The native `<select>` keeps the value,
 * as before; the options' `aria-selected` is synced when the menu opens and on choice.
 */
@Component({
  selector: 'div[ham-list-controls]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-collection-controls hu-shared-filters', role: 'group', 'aria-label': 'חיפוש ומיון' },
  template: `<label class="hu-shared-search"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 5 5"/></svg><input #search type="search" [attr.data-hu-collection-search]="incoming ? null : ''" [attr.data-hu-incoming-search]="incoming ? '' : null" placeholder="חיפוש..." aria-label="חיפוש פריטים" autocomplete="off" (input)="queryChange.emit(search.value)"></label><div class="hu-sort-control"><button #toggleBtn class="hu-sort-button" type="button" data-hu-sort-toggle aria-haspopup="listbox" [attr.aria-expanded]="open() ? 'true' : 'false'" aria-label="מיון הפריטים"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16m0-16-3 3m3-3 3 3M17 20V4m0 16-3-3m3 3 3-3"/></svg><span>מיון</span><svg class="hu-sort-chevron" aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 10 5 5 5-5"/></svg></button><select #select class="hu-sort-native" [attr.data-hu-collection-sort]="incoming ? null : ''" [attr.data-hu-incoming-sort]="incoming ? '' : null" aria-label="מיון הפריטים" tabindex="-1" (change)="sortChange.emit(select.value)">@for (c of choices; track c[0]) {<option [value]="c[0]">{{ c[1] }}</option>}</select><div #popup class="hu-sort-popup" role="listbox" aria-label="אפשרויות מיון" [hidden]="!open()">@for (c of choices; track c[0]) {<button type="button" role="option" [attr.aria-selected]="synced() === c[0] ? 'true' : 'false'" [attr.data-hu-sort-choice]="c[0]"><span>{{ c[1] }}</span><svg class="hu-sort-tick" aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></button>}</div></div>`
})
export class ListControlsComponent implements AfterViewInit, OnDestroy {
  @Input() incoming = false;
  @Input({ required: true }) choices: SortChoice[] = [];
  @Input() query = '';
  @Input() sort = '';
  @Output() readonly queryChange = new EventEmitter<string>();
  @Output() readonly sortChange = new EventEmitter<string>();

  @ViewChild('search', { static: true }) private search!: ElementRef<HTMLInputElement>;
  @ViewChild('select', { static: true }) private select!: ElementRef<HTMLSelectElement>;
  @ViewChild('toggleBtn', { static: true }) private toggleBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('popup', { static: true }) private popup!: ElementRef<HTMLElement>;
  private readonly cdr = inject(ChangeDetectorRef);

  readonly open = signal(false);
  /** Sort value the options' `aria-selected` reflects (null: never synced, all "false"). */
  readonly synced = signal<string | null>(null);

  private readonly onClick = (e: MouseEvent): void => this.click(e);
  private readonly onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') closeAll(); };

  ngAfterViewInit(): void {
    this.search.nativeElement.value = this.query;
    this.select.nativeElement.value = this.sort;
    controls.add(this);
    document.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKey);
  }
  ngOnDestroy(): void {
    controls.delete(this);
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onKey);
  }

  close(): void { if (this.open()) { this.open.set(false); this.cdr.detectChanges(); } }

  private click(e: MouseEvent): void {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (target.closest('[data-hu-sort-toggle]') === this.toggleBtn.nativeElement) {
      const opening = !this.open();
      closeAll();
      this.open.set(opening);
      this.sync();
      e.preventDefault();
      return;
    }
    const choice = target.closest<HTMLElement>('[data-hu-sort-choice]');
    if (choice && this.popup.nativeElement.contains(choice)) {
      const select = this.select.nativeElement;
      select.value = choice.dataset['huSortChoice'] || '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      this.sync();
      closeAll();
      e.preventDefault();
      return;
    }
    if (!target.closest('.hu-manager .hu-sort-popup')) this.close();
  }

  private sync(): void { this.synced.set(this.select.nativeElement.value); this.cdr.detectChanges(); }
}
