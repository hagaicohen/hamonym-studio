import { suggestPublicSlug } from '../slug-suggestions';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, EMPTY, timer, defer, switchMap, takeUntil } from 'rxjs';
import { HmPublicTextPipe } from '../../../../../core/i18n/content-language';
import { AmbassadorService } from '../../../services/ambassador.service';

@Component({
 selector: 'app-ambassador-slug-field', standalone: true,
 imports: [CommonModule, FormsModule, HmPublicTextPipe],
 templateUrl: './ambassador-slug-field.component.html',
 styleUrl: './ambassador-slug-field.component.css',
})
export class AmbassadorSlugFieldComponent implements OnChanges, OnDestroy {
 private readonly service = inject(AmbassadorService);
 private readonly doc = inject(DOCUMENT);
 @Input({ required: true }) campaignSlug!: string;
 @Input() nameForDefault = '';
 @Input() value = '';
 @Input() savedValue?: string;
 @Input() disabled = false;
 @Input() excludeAmbassadorId?: string;
 @Output() valueChange = new EventEmitter<string>();
 @Output() availabilityChange = new EventEmitter<boolean>();
 status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error' = 'idle';
 mode: 'he' | 'en' | 'custom' = 'he';
 @Input() suggestions = false;
 @Input() compact = false;
 private edited = false;
 private get editingSlug(): boolean { return !!this.excludeAmbassadorId; }
 private readonly input$ = new Subject<string>();
 private readonly destroy$ = new Subject<void>();
 constructor() {
  // Cancel the previous timer/request immediately, including during the debounce.
  this.input$.pipe(
   switchMap(value => this.valid(value) && value !== this.savedValue && this.campaignSlug
    ? timer(350).pipe(switchMap(() => defer(() => {
      this.status = 'checking';
      return this.service.checkSlugAvailable(this.campaignSlug, value, this.excludeAmbassadorId);
    })))
    : EMPTY), takeUntil(this.destroy$),
  ).subscribe(result => {
   this.status = result.failed ? 'error' : result.available ? 'available' : 'taken';
   this.availabilityChange.emit(!result.failed && result.available);
  });
 }
 ngOnChanges(changes: SimpleChanges): void {
  if (this.compact && changes['savedValue']?.firstChange && this.savedValue) this.mode = 'custom';
  if (this.compact && !this.editingSlug && !this.edited && changes['nameForDefault'] && this.mode !== 'custom') {
   const suggestion = suggestPublicSlug(this.nameForDefault, this.mode, 60);
   if (suggestion !== this.value) {
    this.value = suggestion;
    this.valueChange.emit(suggestion);
   }
   this.check();
  } else if (!this.edited && !this.value && this.nameForDefault?.trim()) {
   this.value = this.normalize(this.nameForDefault);
   this.valueChange.emit(this.value);
   this.check();
  } else if (changes['value'] || changes['campaignSlug'] || changes['excludeAmbassadorId'] || changes['savedValue']) {
   this.check();
  }
 }
 selectSuggestion(mode: 'he' | 'en' | 'custom'): void {
  this.mode = mode;
  if (mode === 'custom') return;
  this.setValue(suggestPublicSlug(this.nameForDefault, mode, 60));
 }

 retry(): void { this.check(); }
 onInput(value: string): void {
  if (this.suggestions) this.mode = 'custom';
  this.setValue(value);
 }
 normalizeOnBlur(): void {
  if (!this.suggestions) return;
  const normalized = this.normalize(this.value);
  if (normalized !== this.value) this.setValue(normalized);
 }
 private setValue(value: string): void {
  this.edited = true;
  this.value = value;
  this.valueChange.emit(value);
  this.check();
 }
 markTaken(): void { this.status = 'taken'; this.availabilityChange.emit(false); }
 private check(): void {
  if (this.savedValue && this.value === this.savedValue) {
   this.input$.next(this.value);
   this.status = 'idle';
   this.availabilityChange.emit(true);
   return;
  }
  this.availabilityChange.emit(false);
  this.status = !this.value ? 'idle' : this.valid(this.value) ? 'idle' : 'invalid';
  this.input$.next(this.value);
 }
 private valid(value: string): boolean {
  return value.length >= 2 && value.length <= 60 && /^[a-z0-9א-ת]+(?:-[a-z0-9א-ת]+)*$/.test(value);
 }
 private normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9א-ת-]/g, '')
   .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
 }
 get prefix(): string { return `${this.doc.location.origin}/campaigns/${this.campaignSlug}/`; }
 get publicUrl(): string { return this.prefix + (this.value || '…'); }
 ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
