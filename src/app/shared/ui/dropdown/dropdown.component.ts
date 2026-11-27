import { HmIconComponent, HmIconName } from '../design-system/icon.component';
import { booleanAttribute, Component, contentChildren, ElementRef, EventEmitter, forwardRef, HostListener, inject, Input, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface ComboboxEntity { id: string; name: string; }

@Component({
  selector: 'app-dropdown-option',
  standalone: true,
  template: '<ng-content />',
})
export class DropdownOptionComponent {
  @Input({ transform: (value: unknown) => String(value) }) value?: string;
  @Input() ngValue: unknown;
  @Input() icon?: HmIconName;
  @Input({ transform: booleanAttribute }) destructive = false;
  @Input({ transform: booleanAttribute }) disabled = false;
  private readonly element = inject(ElementRef<HTMLElement>);
  get name(): string { return this.element.nativeElement.textContent?.trim() || ''; }
}

interface DropdownItem { value: unknown; name: string; disabled?: boolean; icon?: HmIconName; destructive?: boolean; }

@Component({
  selector: 'app-dropdown, app-entity-combobox',
  standalone: true,
  imports: [HmIconComponent],
  templateUrl: './dropdown.component.html',
  styleUrl: './dropdown.component.css',
  providers: [{
    provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DropdownComponent), multi: true,
  }],
})
export class DropdownComponent implements ControlValueAccessor {
  private static sequence = 0;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly entityMode = this.host.nativeElement.localName === 'app-entity-combobox';
  readonly panelId = 'hm-dropdown-' + ++DropdownComponent.sequence;
  private readonly projected = contentChildren(DropdownOptionComponent, { descendants: true });
  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;
  private panel?: HTMLElement;
  @ViewChild('panel') set dropdownPanel(ref: ElementRef<HTMLElement> | undefined) {
    this.panel = ref?.nativeElement;
    if (this.panel?.showPopover) {
      this.panel.setAttribute('popover', 'manual');
      this.panel.showPopover();
      this.positionPanel();
    }
  }
  @Input() entities: ComboboxEntity[] = [];
  @Input() selectedId?: string;
  @Input() selectedLabel = '';
  @Input() placeholder = this.entityMode ? 'כל העמותות' : 'בחירה';
  @Input() actionMode = false;
  @Input() triggerText = '';
  @Input() label = '';
  @Input() inputId?: string;
  @Input() searchMode: 'auto' | 'remote' = 'auto';
  @Input() statusMessage = '';
  @Input() more = false;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) required = false;
  @Input() value: unknown;
  @Output() selectedIdChange = new EventEmitter<string | undefined>();
  @Output() selectionChange = new EventEmitter<any>();
  @Output() queryChange = new EventEmitter<string>();
  @Output() openedChange = new EventEmitter<boolean>();
  @Output() moreRequested = new EventEmitter<void>();

  open = false;
  query = '';
  private formDisabled = false;
  private updateModel: (value: unknown) => void = () => {};
  private touchModel: () => void = () => {};

  get isDisabled(): boolean { return this.disabled || this.formDisabled; }

  get items(): DropdownItem[] {
    if (this.entityMode) {
      return [{ value: undefined, name: this.placeholder }, ...this.entities.map(item => ({ value: item.id, name: item.name }))];
    }
    return this.projected().map(option => ({
      name: option.name,
      value: option.ngValue !== undefined ? option.ngValue : option.value ?? option.name,
      disabled: option.disabled, icon: option.icon, destructive: option.destructive,
    }));
  }

  get selected(): unknown { return this.entityMode ? this.selectedId || undefined : this.value; }

  get caption(): string {
    const items = this.items;
    return this.triggerText || this.selectedLabel || items.find(item => Object.is(item.value, this.selected))?.name
      || (this.selected === undefined && !this.entityMode ? items[0]?.name : '') || this.placeholder;
  }

  get searchable(): boolean { return this.searchMode === 'remote' || this.items.length > 8; }

  get visibleItems(): DropdownItem[] {
    const query = this.query.trim().toLocaleLowerCase();
    const items = this.items;
    return this.searchMode === 'remote' || !query ? items : items.filter(item => item.name.toLocaleLowerCase().includes(query));
  }

  isSelected(item: DropdownItem): boolean {
    if (this.actionMode) return false;
    return Object.is(item.value, this.selected)
      || (!this.entityMode && this.selected === undefined && Object.is(item.value, this.items[0]?.value));
  }

  writeValue(value: unknown): void { this.value = value; }
  registerOnChange(fn: (value: unknown) => void): void { this.updateModel = fn; }
  registerOnTouched(fn: () => void): void { this.touchModel = fn; }
  setDisabledState(disabled: boolean): void { this.formDisabled = disabled; }

  toggle(): void { if (this.open) this.close(); else this.show(); }

  show(): void {
    if (this.open || this.isDisabled) return;
    this.query = '';
    this.open = true;
    this.openedChange.emit(true);
  }

  close(restoreFocus = false): void {
    if (!this.open) return;
    this.open = false;
    this.openedChange.emit(false);
    this.touchModel();
    if (restoreFocus) this.trigger?.nativeElement.focus();
  }

  setQuery(query: string): void { this.query = query; this.queryChange.emit(query); }

  choose(item: DropdownItem): void {
    if (item.disabled || this.isDisabled) return;
    if (this.actionMode) {
      this.close(true);
      this.selectionChange.emit(item.value);
    } else if (this.entityMode) {
      const value = item.value as string | undefined;
      this.selectedId = value;
      this.close(true);
      this.selectedIdChange.emit(value);
    } else if (!Object.is(item.value, this.value)) {
      this.value = item.value;
      this.updateModel(item.value);
      this.close(true);
      this.selectionChange.emit(item.value);
    } else {
      this.close(true);
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(event: PointerEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('focusout', ['$event'])
  onBlur(event: FocusEvent): void {
    if (this.open && event.relatedTarget && !this.host.nativeElement.contains(event.relatedTarget as Node)) this.close();
  }

  @HostListener('keydown', ['$event'])
  onKeyboard(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (this.isDisabled) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (!this.open) { this.show(); setTimeout(() => this.moveFocus(step), 0); }
      else this.moveFocus(step);
    }
  }

  private moveFocus(step: number): void {
    if (!this.open) return;
    const options = Array.from(this.panel?.querySelectorAll<HTMLButtonElement>('.dropdown-option:not(:disabled)') ?? []);
    if (!options.length) return;
    const current = options.findIndex(option => option === option.ownerDocument.activeElement);
    const next = current < 0 ? (step > 0 ? 0 : options.length - 1) : (current + step + options.length) % options.length;
    options[next].focus();
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  positionPanel(): void {
    const panel = this.panel;
    const trigger = this.trigger?.nativeElement;
    if (!this.open || !panel?.hasAttribute('popover') || !trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const view = trigger.ownerDocument.documentElement;
    const edge = 8;
    panel.style.minWidth = Math.min(bounds.width, Math.max(0, view.clientWidth - edge * 2)) + 'px';
    const width = panel.getBoundingClientRect().width;
    const left = getComputedStyle(trigger).direction === 'rtl' ? bounds.right - width : bounds.left;
    panel.style.left = Math.max(edge, Math.min(left, view.clientWidth - width - edge)) + 'px';
    const below = view.clientHeight - bounds.bottom - edge;
    const above = bounds.top - edge;
    const placeAbove = below < 220 && above > below;
    panel.style.maxHeight = Math.max(0, (placeAbove ? above : below) - 5) + 'px';
    panel.style.top = placeAbove ? 'auto' : bounds.bottom + 5 + 'px';
    panel.style.bottom = placeAbove ? view.clientHeight - bounds.top + 5 + 'px' : 'auto';
  }
}
