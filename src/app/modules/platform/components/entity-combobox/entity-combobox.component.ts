import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ComboboxEntity {
  id: string;
  name: string;
}

// Minimal, generic nonprofit-picker combobox (2026-10) -- no reusable
// searchable-dropdown component existed anywhere in the app before this
// (checked: only native <select>/<datalist> and one bespoke search modal
// specific to linking Partners). Used identically on the Overview, History
// and Reports sections of the unified "ניהול גבייה" page -- one component,
// not three copies of the same click-to-open/type-to-filter/select/clear
// behavior.
@Component({
  selector: 'app-entity-combobox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entity-combobox.component.html',
  styleUrl: './entity-combobox.component.css',
})
export class EntityComboboxComponent {
  @Input() entities: ComboboxEntity[] = [];
  @Input() selectedId: string | undefined;
  @Input() placeholder = 'כל העמותות';
  @Output() selectedIdChange = new EventEmitter<string | undefined>();

  open = false;
  query = '';

  get filtered(): ComboboxEntity[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.entities;
    return this.entities.filter((e) => e.name.toLowerCase().includes(q));
  }

  get selectedName(): string {
    return this.entities.find((e) => e.id === this.selectedId)?.name ?? '';
  }

  onFocus(): void {
    this.open = true;
    this.query = '';
  }

  // Closing on blur must be deferred -- an option's own (click) would
  // otherwise never fire, because blur runs first and hides the list.
  onBlur(): void {
    setTimeout(() => (this.open = false), 150);
  }

  onInput(value: string): void {
    this.query = value;
    this.open = true;
  }

  select(e: ComboboxEntity): void {
    this.selectedId = e.id;
    this.selectedIdChange.emit(e.id);
    this.query = '';
    this.open = false;
  }

  clear(): void {
    this.selectedId = undefined;
    this.selectedIdChange.emit(undefined);
    this.query = '';
    this.open = false;
  }
}
