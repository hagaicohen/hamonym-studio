import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild, signal } from '@angular/core';
import { LucideAngularModule, Check, Search, X } from 'lucide-angular';
import { NgTemplateOutlet } from '@angular/common';
import { ENTITY_CATEGORIES } from '../../config/entity-categories';
import { normalizeCategoryText } from './category-selection';
import { CategoryOption, categoryLabel, categorySolidIcon } from '../../config/category-presentation';

/**
 * Shared searchable category list: multiple organization activities or one
 * campaign purpose. Selected IDs retain their order and unknown legacy values.
 */
@Component({
  selector: 'app-category-selector',
  standalone: true,
  imports: [LucideAngularModule, NgTemplateOutlet],
  templateUrl: './category-selector.component.html',
  styleUrl: './category-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategorySelectorComponent {
  @ViewChild('options') private options?: ElementRef<HTMLElement>;
  @Input() categories: CategoryOption[] = ENTITY_CATEGORIES;
  @Input() selected: string[] | null | undefined = [];
  @Input() inputId = 'category-search';
  @Input() multiple = true;
  @Input() label = 'חיפוש ובחירת קטגוריות';
  @Input() subcategory = '';
  @Input() limit?: number;
  @Output() subcategorySelected = new EventEmitter<{ id: string; value: string }>();
  readonly categoryLabel = categoryLabel;

  @Output() selectedChange = new EventEmitter<string[]>();

  readonly query = signal('');
  readonly Check = Check;
  readonly Search = Search;
  readonly X = X;

  get selectedIds(): string[] {
    return [...new Set(this.selected ?? [])];
  }

  get visible(): CategoryOption[] {
    const q = normalizeCategoryText(this.query());
    const matches = q ? this.categories.filter(c => normalizeCategoryText([categoryLabel(c), c.label, ...(c.sub || [])].join(' ')).includes(q)) : this.categories;
    return this.limit ? matches.slice(0, this.limit) : matches;
  }

  labelOf(id: string): string {
    const category = this.categories.find(c => c.id === id);
    return category ? categoryLabel(category) : id;
  }
  iconForId(id: string) {
    return categorySolidIcon(this.categories.find(category => category.id === id) ?? { id, label: id });
  }

  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  toggle(id: string): void {
    if (!this.multiple) { if (!this.isSelected(id)) this.emit([id]); return; }
    this.emit(this.isSelected(id) ? this.selectedIds.filter((c) => c !== id) : [...this.selectedIds, id]);
  }

  matchingSubcategories(category: CategoryOption): string[] {
    const query = normalizeCategoryText(this.query());
    return !this.multiple && query ? (category.sub || []).filter(value => normalizeCategoryText(value).includes(query)) : [];
  }
  chooseSubcategory(id: string, value: string): void {
    this.subcategorySelected.emit({ id, value });
  }

  remove(id: string): void {
    this.emit(this.selectedIds.filter((c) => c !== id));
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  clearSearch(input: HTMLInputElement): void {
    input.value = '';
    this.query.set('');
  }
  searchKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter') return;
    event.preventDefault();
    const first = this.options?.nativeElement.querySelector<HTMLButtonElement>('button');
    if (event.key === 'Enter') first?.click(); else first?.focus();
  }
  optionKey(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = Array.from(this.options?.nativeElement.querySelectorAll<HTMLButtonElement>('button') || []);
    const index = options.indexOf(event.target as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
    event.preventDefault();
    options[Math.max(0, Math.min(next, options.length - 1))]?.focus();
  }

  private emit(list: string[]): void {
    this.selected = list;
    this.selectedChange.emit(list);
  }
}
