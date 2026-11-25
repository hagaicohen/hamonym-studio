import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/** Labelled text input. `hwGoal` is shown with thousands separators while typing. */
@Component({selector:'ham-wizard-field',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
 templateUrl:'./wizard-field.component.html',styleUrl:'./wizard-field.component.css'})
export class WizardFieldComponent {
 @Input() fieldId = '';
 @Input() title = '';
 @Input() value = '';
 @Input() placeholder = '';
 @Input() type = 'text';
 @Input() help = '';
 @Output() valueChange = new EventEmitter<string>();
 get isMoney(): boolean { return this.fieldId === 'hwGoal'; }
 get displayValue(): string { return this.isMoney ? this.formatGoal(this.value) : this.value; }
 onInput(event: Event): void {
   const input = event.target as HTMLInputElement;
   if (this.isMoney) this.reformat(input);
   this.valueChange.emit(input.value);
 }
 private reformat(input: HTMLInputElement): void {
   const original = input.value;
   const selection = input.selectionStart ?? original.length;
   const digitsBeforeCaret = (original.slice(0, selection).match(/\d/g) || []).length;
   const formatted = this.formatGoal(original);
   if (original === formatted) return;
   input.value = formatted;
   let caret = 0, digits = 0;
   while (caret < formatted.length && digits < digitsBeforeCaret) { if (/\d/.test(formatted[caret])) digits++; caret++; }
   try { input.setSelectionRange(caret, caret); } catch { /* not focusable */ }
 }
 private formatGoal(raw: string): string {
   const digits = String(raw ?? '').replace(/\D/g, '');
   return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
 }
}
