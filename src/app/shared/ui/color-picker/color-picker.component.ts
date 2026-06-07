import { Component, Input, Output, EventEmitter, HostListener, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const COMPACT_PALETTE: string[] = [
  // neutrals
  '#ffffff','#f1f5f9','#cbd5e1','#94a3b8','#475569','#1e293b','#000000',
  // reds / pinks
  '#fca5a5','#ef4444','#b91c1c','#f9a8d4','#ec4899','#9d174d',
  // oranges / yellows
  '#fdba74','#f97316','#c2410c','#fde047','#eab308','#854d0e',
  // greens
  '#86efac','#22c55e','#15803d','#6ee7b7','#10b981','#065f46',
  // blues / purples
  '#93c5fd','#3b82f6','#1d4ed8','#c4b5fd','#8b5cf6','#4c1d95',
];

const CSS_NAMES = [
  'transparent','white','black',
  'aliceblue','antiquewhite','aqua','aquamarine','azure',
  'beige','bisque','blanchedalmond','blue','blueviolet','brown','burlywood',
  'cadetblue','chartreuse','chocolate','coral','cornflowerblue','cornsilk','crimson','cyan',
  'darkblue','darkcyan','darkgoldenrod','darkgray','darkgreen','darkkhaki','darkmagenta',
  'darkolivegreen','darkorange','darkorchid','darkred','darksalmon','darkseagreen',
  'darkslateblue','darkslategray','darkturquoise','darkviolet','deeppink','deepskyblue',
  'dimgray','dodgerblue','firebrick','forestgreen','fuchsia','gainsboro',
  'gold','goldenrod','gray','green','greenyellow','honeydew','hotpink',
  'indianred','indigo','ivory','khaki','lavender','lavenderblush','lawngreen','lemonchiffon',
  'lightblue','lightcoral','lightcyan','lightgray','lightgreen','lightpink',
  'lightsalmon','lightseagreen','lightskyblue','lightslategray','lightyellow',
  'lime','limegreen','linen','magenta','maroon','mediumaquamarine','mediumblue',
  'mediumorchid','mediumpurple','mediumseagreen','mediumslateblue','mediumspringgreen',
  'mediumturquoise','mediumvioletred','midnightblue','mintcream','mistyrose',
  'navy','olive','olivedrab','orange','orangered','orchid',
  'palegoldenrod','palegreen','paleturquoise','palevioletred','papayawhip','peachpuff',
  'peru','pink','plum','powderblue','purple','red','rosybrown','royalblue',
  'saddlebrown','salmon','sandybrown','seagreen','sienna','silver','skyblue',
  'slateblue','slategray','springgreen','steelblue','tan','teal','thistle',
  'tomato','turquoise','violet','wheat','yellow','yellowgreen',
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
  @Input() showNone = false;
  @Input() label = '';

  private el = inject(ElementRef);

  open       = false;
  hexInput   = '';
  nameSearch = '';
  dropdownTop    = 0;
  dropdownRight  = 0;
  dropdownMaxHeight = 420;

  readonly compactPalette = COMPACT_PALETTE;
  readonly cssNames       = CSS_NAMES;

  get livePreview(): string {
    return this.parseHex(this.hexInput) ?? (this.isTransparent(this.value) ? '' : this.value);
  }

  get filteredNames(): string[] {
    const q = this.nameSearch.trim().toLowerCase();
    return q ? this.cssNames.filter(n => n.includes(q)) : [];
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) {
      this.hexInput   = this.isTransparent(this.value) ? '' : this.value;
      this.nameSearch = '';
      this.positionDropdown();
    }
  }

  onHexInput(): void {
    const color = this.parseHex(this.hexInput);
    if (color) this.valueChange.emit(color);
  }

  applyHex(): void {
    const color = this.parseHex(this.hexInput);
    if (color) this.select(color);
  }

  private parseHex(raw: string): string | null {
    const s = raw.trim();
    const hex = s.startsWith('#') ? s : '#' + s;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex) ? hex.toLowerCase() : null;
  }

  select(color: string): void {
    this.valueChange.emit(color);
    this.open = false;
  }

  onNativeColorInput(event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    this.hexInput = color;
    this.valueChange.emit(color);
  }

  isTransparent(color: string): boolean {
    return color === '' || color === 'transparent';
  }

  isLight(hex: string): boolean {
    if (!hex.startsWith('#')) return false;
    const full = hex.length === 4
      ? '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3] : hex;
    const r = parseInt(full.slice(1,3),16);
    const g = parseInt(full.slice(3,5),16);
    const b = parseInt(full.slice(5,7),16);
    return (r*299 + g*587 + b*114)/1000 > 210;
  }

  private positionDropdown(): void {
    const trigger = this.el.nativeElement.querySelector('.cp-trigger') as HTMLElement;
    if (!trigger) return;
    const rect    = trigger.getBoundingClientRect();
    const dropW   = 272;
    const gap     = 6;
    const margin  = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
      this.dropdownTop      = rect.bottom + gap;
      this.dropdownMaxHeight = Math.min(480, spaceBelow);
    } else {
      this.dropdownMaxHeight = Math.min(480, spaceAbove);
      this.dropdownTop       = rect.top - gap - this.dropdownMaxHeight;
    }
    const rightFromEdge = window.innerWidth - rect.right;
    this.dropdownRight  = (rect.right - dropW) < margin
      ? window.innerWidth - dropW - margin : rightFromEdge;
  }

  @HostListener('window:scroll')
  onScroll(): void { if (this.open) this.positionDropdown(); }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.open && !this.el.nativeElement.contains(e.target)) {
      this.open = false;
    }
  }
}
