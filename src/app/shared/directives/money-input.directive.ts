import { Directive, ElementRef, HostListener, forwardRef, inject } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

/** Display-only grouping. Angular forms and API payloads retain numbers. */
@Directive({
  selector: 'input[appMoneyInput]',
  standalone: true,
  host: { inputmode: 'decimal', dir: 'ltr' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInputDirective), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => MoneyInputDirective), multi: true },
  ],
})
export class MoneyInputDirective implements ControlValueAccessor, Validator {
  private input = inject(ElementRef<HTMLInputElement>).nativeElement;
  private change: (value: number | null) => void = () => {};
  private touched = () => {};
  private previous = '';
  private composing = false;

  writeValue(value: number | null): void {
    this.previous = value == null || !Number.isFinite(Number(value)) ? '' : this.group(String(value));
    this.input.value = this.previous;
  }

  registerOnChange(fn: (value: number | null) => void): void { this.change = fn; }
  registerOnTouched(fn: () => void): void { this.touched = fn; }
  setDisabledState(disabled: boolean): void { this.input.disabled = disabled; }

  validate(control: AbstractControl): ValidationErrors | null {
    if (control.value == null) return null;
    for (const limit of ['min', 'max'] as const) {
      const attribute = this.input.getAttribute(limit);
      if (attribute == null || attribute === '') continue;
      const value = Number(attribute);
      if (limit === 'min' ? control.value < value : control.value > value) {
        return { [limit]: { [limit]: value, actual: control.value } };
      }
    }
    return null;
  }

  private group(raw: string): string {
    const [integer, decimal] = raw.split('.');
    return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decimal === undefined ? '' : '.' + decimal);
  }

  @HostListener('compositionstart') startComposition(): void { this.composing = true; }
  @HostListener('compositionend') endComposition(): void { this.composing = false; this.onInput(); }

  @HostListener('input') onInput(): void {
    if (this.composing) return;
    const text = this.input.value;
    const caret = this.input.selectionStart ?? text.length;
    const raw = text.replace(/[,\s₪]/g, '');
    if (!/^-?\d*(\.\d*)?$/.test(raw) || (raw !== '' && raw !== '-' && raw !== '.' && raw !== '-.' && !Number.isFinite(Number(raw)))) {
      this.input.value = this.previous;
      return;
    }
    const significantBeforeCaret = text.slice(0, caret).replace(/[,\s₪]/g, '').length;
    this.previous = this.group(raw);
    this.input.value = this.previous;
    let position = 0, count = 0;
    while (position < this.previous.length && count < significantBeforeCaret) {
      if (this.previous[position] !== ',') count++;
      position++;
    }
    this.input.setSelectionRange(position, position);
    this.change(raw === '' || raw === '-' || raw === '.' || raw === '-.' ? null : Number(raw));
  }

  @HostListener('blur') onBlur(): void { this.touched(); }
}
