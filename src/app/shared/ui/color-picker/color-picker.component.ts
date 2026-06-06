import { Component, Input, Output, EventEmitter, HostListener, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const PALETTE: string[][] = [
  ['#ffffff','#f8fafc','#f1f5f9','#e2e8f0','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a','#000000'],
  ['#fee2e2','#fca5a5','#f87171','#ef4444','#dc2626','#b91c1c','#991b1b'],
  ['#ffedd5','#fdba74','#fb923c','#f97316','#ea580c','#c2410c','#9a3412'],
  ['#fef9c3','#fde047','#facc15','#eab308','#ca8a04','#a16207','#854d0e'],
  ['#dcfce7','#86efac','#4ade80','#22c55e','#16a34a','#15803d','#14532d'],
  ['#d1fae5','#6ee7b7','#34d399','#10b981','#059669','#047857','#065f46'],
  ['#dbeafe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e40af'],
  ['#ede9fe','#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#6d28d9','#4c1d95'],
  ['#fce7f3','#f9a8d4','#f472b6','#ec4899','#db2777','#be185d','#9d174d'],
];

const CSS_NAMES = [
  'transparent','white','black','lightgray','gray','darkgray',
  'lightblue','lightyellow','lightgreen','lightsalmon','lavender',
  'beige','ivory','snow','honeydew','mintcream',
];

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.css',
})
export class ColorPickerComponent {
  @Input()  value = '#000000';
  @Output() valueChange = new EventEmitter<string>();

  /** Show a "transparent / ללא" option */
  @Input() showNone = false;
  /** Label shown on the trigger button */
  @Input() label = '';

  private el = inject(ElementRef);

  open = false;
  inputValue = '';

  readonly palette = PALETTE;
  readonly cssNames = CSS_NAMES;

  toggle(): void {
    this.open = !this.open;
    if (this.open) this.inputValue = this.value;
  }

  select(color: string): void {
    this.valueChange.emit(color);
    this.open = false;
  }

  applyInput(): void {
    const v = this.inputValue.trim();
    if (v) { this.valueChange.emit(v); this.open = false; }
  }

  onNativeColorInput(event: Event): void {
    this.inputValue = (event.target as HTMLInputElement).value;
    this.valueChange.emit(this.inputValue);
  }

  isTransparent(color: string): boolean {
    return color === '' || color === 'transparent';
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.open && !this.el.nativeElement.contains(e.target)) {
      this.open = false;
    }
  }
}
