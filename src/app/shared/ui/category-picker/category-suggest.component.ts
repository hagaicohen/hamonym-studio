import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, Input, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CategorySuggestionsService } from '../../../core/services/category-suggestions.service';

let nextId = 0;

/**
 * "חסרה קטגוריה?" — sends a suggestion for Super Admin review. Never adds a
 * category: the official list only changes in a separate, reviewed release.
 */
@Component({
  selector: 'app-category-suggest',
  standalone: true,
  templateUrl: './category-suggest.component.html',
  styleUrl: './category-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategorySuggestComponent {
  /** The organization the suggestion is made for, when it already exists. */
  @Input() entityId: string | null | undefined = null;

  @ViewChild('field') field?: ElementRef<HTMLInputElement>;
  @ViewChild('link') link?: ElementRef<HTMLButtonElement>;

  readonly uid = `hm-category-suggest-${++nextId}`;
  readonly maxLength = 60;

  open = false;
  label = '';
  sending = false;
  message = '';
  error = '';

  private readonly api = inject(CategorySuggestionsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  toggle(): void {
    this.open = !this.open;
    this.error = '';
    if (this.open) this.message = '';
    this.cdr.markForCheck();
    // Keep keyboard focus on the control that replaced the one just clicked.
    setTimeout(() => (this.open ? this.field : this.link)?.nativeElement.focus());
  }

  onInput(event: Event): void {
    this.label = (event.target as HTMLInputElement).value;
    this.error = '';
  }

  submit(event?: Event): void {
    event?.preventDefault();
    const label = this.label.replace(/\s+/g, ' ').trim();
    if (label.length < 2) {
      this.error = 'שם הקטגוריה צריך להכיל לפחות 2 תווים';
      return;
    }
    this.sending = true;
    this.error = '';
    this.api.suggest(label, this.entityId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.sending = false;
        this.open = false;
        this.label = '';
        this.message = res.duplicate
          ? `ההצעה „${res.suggestion.label}” כבר נמצאת בבדיקה. תודה!`
          : 'תודה! ההצעה נשלחה לבדיקה. היא לא תתווסף לרשימה באופן אוטומטי.';
        this.cdr.markForCheck();
        setTimeout(() => this.link?.nativeElement.focus());
      },
      error: (err) => {
        this.sending = false;
        const existing = err?.error?.code === 'CATEGORY_EXISTS' ? err.error.category?.label : null;
        this.error = existing
          ? `הקטגוריה „${existing}” כבר קיימת ברשימה. אפשר לחפש אותה ולבחור בה.`
          : err?.error?.error || 'שליחת ההצעה נכשלה. נסו שוב.';
        this.cdr.markForCheck();
      },
    });
  }
}
