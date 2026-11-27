import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, EMPTY, timer, switchMap, takeUntil } from 'rxjs';
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
 @Input() disabled = false;
 @Input() excludeAmbassadorId?: string;
 @Output() valueChange = new EventEmitter<string>();
 @Output() availabilityChange = new EventEmitter<boolean>();
 status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error' = 'idle';
 private edited = false;
 private readonly input$ = new Subject<string>();
 private readonly destroy$ = new Subject<void>();
 constructor() {
  // Cancel the previous timer/request immediately, including during the debounce.
  this.input$.pipe(
   switchMap(value => this.valid(value) && this.campaignSlug
    ? timer(400).pipe(switchMap(() => this.service.checkSlugAvailable(this.campaignSlug, value, this.excludeAmbassadorId)))
    : EMPTY), takeUntil(this.destroy$),
  ).subscribe(result => {
   this.status = result.failed ? 'error' : result.available ? 'available' : 'taken';
   this.availabilityChange.emit(!result.failed && result.available);
  });
 }
 ngOnChanges(changes: SimpleChanges): void {
  if (!this.edited && !this.value && this.nameForDefault?.trim()) {
   this.value = this.normalize(this.nameForDefault);
   this.valueChange.emit(this.value);
   this.check();
  } else if (changes['value'] || changes['campaignSlug'] || changes['excludeAmbassadorId']) {
   this.check();
  }
 }
 onInput(value: string): void {
  this.edited = true;
  this.value = value;
  this.valueChange.emit(value);
  this.check();
 }
 markTaken(): void { this.status = 'taken'; this.availabilityChange.emit(false); }
 private check(): void {
  this.availabilityChange.emit(false);
  this.status = !this.value ? 'idle' : this.valid(this.value) ? 'checking' : 'invalid';
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
