import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { LucideAngularModule, Check, Search, X } from 'lucide-angular';
import { ENTITY_CATEGORIES, EntityCategory } from '../../config/entity-categories';
import { normalizeCategoryText } from './category-selection';

/**
 * One multi-select for organization categories: a search field, the selected
 * categories (always visible, in selection order) and every category as a
 * toggle chip. The search filters only the "all categories" list.
 */
@Component({
  selector: 'app-category-selector',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './category-selector.component.html',
  styleUrl: './category-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategorySelectorComponent {
  @Input() categories: EntityCategory[] = ENTITY_CATEGORIES;
  @Input() selected: string[] | null | undefined = [];
  @Input() inputId = 'category-search';

  @Output() selectedChange = new EventEmitter<string[]>();

  readonly query = signal('');
  readonly Check = Check;
  readonly Search = Search;
  readonly X = X;

  get selectedIds(): string[] {
    return [...new Set(this.selected ?? [])];
  }

  get visible(): EntityCategory[] {
    const q = normalizeCategoryText(this.query());
    return q ? this.categories.filter((c) => normalizeCategoryText(c.label).includes(q)) : this.categories;
  }

  labelOf(id: string): string {
    return this.categories.find((c) => c.id === id)?.label ?? id;
  }

  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  toggle(id: string): void {
    this.emit(this.isSelected(id) ? this.selectedIds.filter((c) => c !== id) : [...this.selectedIds, id]);
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

  private emit(list: string[]): void {
    this.selected = list;
    this.selectedChange.emit(list);
  }
}
