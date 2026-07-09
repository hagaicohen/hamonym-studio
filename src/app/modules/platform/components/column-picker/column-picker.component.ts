import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ColumnDef {
  key: string;
  label: string;
}

@Component({
  selector: 'app-column-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './column-picker.component.html',
  styleUrl: './column-picker.component.css',
})
export class ColumnPickerComponent implements OnInit {
  @Input() columns: ColumnDef[] = [];
  @Input() storageKey = '';
  @Output() visibleChange = new EventEmitter<Set<string>>();

  private host = inject(ElementRef);

  open = false;
  visible = new Set<string>();

  ngOnInit(): void {
    this.visible = this._load();
    this.visibleChange.emit(new Set(this.visible));
  }

  toggleOpen(): void {
    this.open = !this.open;
  }

  isVisible(key: string): boolean {
    return this.visible.has(key);
  }

  toggleColumn(key: string): void {
    if (this.visible.has(key)) this.visible.delete(key);
    else this.visible.add(key);
    this._save();
    this.visibleChange.emit(new Set(this.visible));
  }

  resetToDefault(): void {
    this.visible = new Set(this.columns.map((c) => c.key));
    this._save();
    this.visibleChange.emit(new Set(this.visible));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(evt: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(evt.target)) {
      this.open = false;
    }
  }

  private _load(): Set<string> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const saved: string[] = JSON.parse(raw);
        // Drop keys that no longer exist (component definition changed since last save)
        const validKeys = new Set(this.columns.map((c) => c.key));
        return new Set(saved.filter((k) => validKeys.has(k)));
      }
    } catch {
      // fall through to default
    }
    return new Set(this.columns.map((c) => c.key));
  }

  private _save(): void {
    localStorage.setItem(this.storageKey, JSON.stringify([...this.visible]));
  }
}
