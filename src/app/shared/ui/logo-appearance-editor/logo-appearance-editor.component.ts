import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

export type LogoShape = 'circle' | 'square' | 'none';
export type LogoSize = 'sm' | 'md' | 'lg';
export type LogoBorderStyle = 'solid' | 'dashed';

// Shared logo APPEARANCE controls — shape/size/background/(optional) border
// — reused by both the Quick Donation page's logo editor
// (campaign-minimal-details-step) and the regular Campaign Hero's logo
// editor (campaign-basic-step), 2026-09-28. Deliberately narrow: upload/
// replace/remove and position/alignment stay in each parent step, since
// they genuinely differ between the two (Hero's upload also runs its own
// autoContrastLogoBg(); "alignment" in the minimal page is in-flow flexbox
// placement in a plain header row, "position" in Hero is absolute overlay
// placement on a background photo — confirmed different rendering
// mechanisms, not the same concept under two names).
//
// Purely presentational, no side effects: two-way-bindable via the
// standard Angular [(x)]/xChange convention, so each parent keeps owning
// its own model field names/defaults and just wires them in.
@Component({
  selector: 'app-logo-appearance-editor',
  standalone: true,
  imports: [CommonModule, ColorPickerComponent],
  templateUrl: './logo-appearance-editor.component.html',
  styleUrl: './logo-appearance-editor.component.css',
})
export class LogoAppearanceEditorComponent {
  @Input() shape: LogoShape = 'circle';
  @Output() shapeChange = new EventEmitter<LogoShape>();

  @Input() size: LogoSize = 'md';
  @Output() sizeChange = new EventEmitter<LogoSize>();

  @Input() background = '';
  @Output() backgroundChange = new EventEmitter<string>();

  // Border is an optional, Hero-specific extension — the quick-donation
  // page has no border concept at all today, so this whole section stays
  // hidden unless a parent explicitly opts in.
  @Input() showBorder = false;
  @Input() borderColor = '';
  @Output() borderColorChange = new EventEmitter<string>();
  @Input() borderStyle: LogoBorderStyle = 'solid';
  @Output() borderStyleChange = new EventEmitter<LogoBorderStyle>();
  @Input() borderWidth = 3;
  @Output() borderWidthChange = new EventEmitter<number>();

  setShape(shape: LogoShape): void { this.shapeChange.emit(shape); }
  setSize(size: LogoSize): void { this.sizeChange.emit(size); }
  setBackground(color: string): void { this.backgroundChange.emit(color); }
  setBorderColor(color: string): void { this.borderColorChange.emit(color); }
  setBorderStyle(style: LogoBorderStyle): void { this.borderStyleChange.emit(style); }

  onBorderWidthInput(event: Event): void {
    this.borderWidthChange.emit(+(event.target as HTMLInputElement).value);
  }
}
