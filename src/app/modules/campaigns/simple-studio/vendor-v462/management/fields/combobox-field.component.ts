import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ManagementModelService } from '../management-model.service';
import { ManagementViewService } from '../management-view.service';
import { ManagementEditService } from '../management-edit.service';

export interface ComboOption { value: string; label: string; /** Text matched by the search box (a category also matches its subcategories). */ search: string; }

const fold = (s: string): string => s.toLocaleLowerCase('he-IL');

/**
 * Searchable select of a management field (old engine `selectField(…, {searchable:true})` with
 * `toggleCombo`/`closeCombos` and its click, input and keyboard handlers, removed from the engine).
 * The `data-hu-combo-*` attributes are kept so the markup is unchanged.
 */
@Component({
  selector: 'div[ham-combobox-field]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hu-field', '[class.full]': 'full' },
  template: `@let cur = current();
<label>{{ label }}</label><div class="hu-combobox" #box><button class="hu-combo-trigger" type="button" [attr.data-hu-combo-trigger]="path" role="combobox" aria-haspopup="listbox" [attr.aria-expanded]="open()" (click)="toggle()"><span>{{ selectedLabel(cur) }}</span><i class="hu-chevron" aria-hidden="true"></i></button><div class="hu-combo-popup" [attr.data-hu-combo-popup]="path" [hidden]="!open()"><input #search class="hu-combo-search" [attr.data-hu-combo-search]="path" type="search" [attr.placeholder]="'חיפוש ' + label + '...'" [attr.aria-label]="'חיפוש ' + label" autocomplete="off" (input)="term.set(search.value)" (keydown)="searchKey($event)"><div class="hu-combo-options" role="listbox" #list>@for (o of options; track $index) {<button class="hu-combo-option" type="button" role="option" [attr.aria-selected]="o.value === cur" [attr.data-hu-combo-select]="path" [attr.data-hu-search-text]="o.search" [attr.data-value]="o.value" [hidden]="!matches(o, term())" (click)="choose(o)" (keydown)="optionKey($event)">{{ o.label }}</button>}<div class="hu-combo-empty">לא נמצאו אפשרויות מתאימות</div></div></div></div>@if (hint) {<span class="hu-hint">{{ hint }}</span>}`
})
export class ComboboxFieldComponent implements OnInit, OnDestroy {
  readonly view = inject(ManagementViewService);
  private readonly model = inject(ManagementModelService);
  private readonly edit = inject(ManagementEditService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) label = '';
  @Input({ required: true }) path = '';
  @Input({ required: true }) options: ComboOption[] = [];
  @Input() full = false;
  @Input() hint = '';

  @ViewChild('box', { static: true }) private box!: ElementRef<HTMLElement>;
  @ViewChild('search', { static: true }) private search!: ElementRef<HTMLInputElement>;
  @ViewChild('list', { static: true }) private list!: ElementRef<HTMLElement>;

  readonly open = signal(false);
  readonly term = signal('');
  private off: (() => void) | null = null;

  /** A redraw used to rebuild the field closed, with an empty search. */
  ngOnInit(): void { this.off = this.view.onDraw(() => { if (this.open() || this.term()) { this.close(); this.cdr.detectChanges(); } }); }
  ngOnDestroy(): void { this.off?.(); }

  /** Stored value, read once per redraw (the old field was rebuilt only then). */
  readonly current = computed(() => { this.view.revision(); return String(this.model.get(this.path) ?? ''); });
  selectedLabel(cur: string): string { return this.options.find(o => o.value === cur)?.label || cur || 'בחרו מתוך הרשימה'; }
  matches(o: ComboOption, term: string): boolean { return fold(o.search || o.label).includes(fold(term.trim())); }

  toggle(): void {
    if (this.open()) { this.close(); return; }
    this.term.set('');
    this.search.nativeElement.value = '';
    this.open.set(true);
    this.cdr.detectChanges();
    this.search.nativeElement.focus();
  }

  choose(o: ComboOption): void {
    this.close();
    this.edit.snapshot();
    this.edit.commit(this.path, o.value, { rebuild: true });
  }

  private close(): void { this.open.set(false); this.term.set(''); this.search.nativeElement.value = ''; }
  private visibleOptions(): HTMLButtonElement[] {
    return Array.from(this.list.nativeElement.querySelectorAll<HTMLButtonElement>('.hu-combo-option')).filter(b => !b.hidden);
  }

  searchKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown') return;
    const first = this.visibleOptions()[0];
    if (!first) return;
    e.preventDefault();
    if (e.key === 'Enter') first.click(); else first.focus();
  }

  optionKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = this.visibleOptions();
    const next = all[all.indexOf(e.target as HTMLButtonElement) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) { e.preventDefault(); next.focus(); }
  }

  @HostListener('document:click', ['$event'])
  outside(e: MouseEvent): void {
    if (this.open() && !(e.target instanceof Node && this.box.nativeElement.contains(e.target))) this.close();
  }

  @HostListener('document:keydown', ['$event'])
  escape(e: KeyboardEvent): void { if (e.key === 'Escape' && this.open()) this.close(); }
}
