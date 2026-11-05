import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CategorySuggestion,
  CategorySuggestionStatus,
  CategorySuggestionsService,
} from '../../../../core/services/category-suggestions.service';
import { israelDate } from '../../utils/admin-display';

const STATUS_LABELS: Record<CategorySuggestionStatus, string> = {
  pending: 'ממתינות לבדיקה',
  approved: 'אושרו',
  rejected: 'נדחו',
};

/**
 * Super Admin review of category suggestions. Approving records agreement
 * only: the official category list changes in a separate release, never here.
 */
@Component({
  selector: 'app-platform-category-suggestions-page',
  standalone: true,
  templateUrl: './platform-category-suggestions-page.component.html',
  styleUrl: './platform-category-suggestions-page.component.css',
})
export class PlatformCategorySuggestionsPageComponent implements OnInit {
  private readonly api = inject(CategorySuggestionsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses: CategorySuggestionStatus[] = ['pending', 'approved', 'rejected'];
  readonly statusLabels = STATUS_LABELS;
  readonly fmtDate = israelDate;

  status: CategorySuggestionStatus = 'pending';
  suggestions: CategorySuggestion[] = [];
  counts: Record<CategorySuggestionStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  loading = true;
  error = '';

  /** The suggestion whose decision panel is open, and its pending decision. */
  reviewing: { item: CategorySuggestion; decision: 'approve' | 'reject' } | null = null;
  note = '';
  saving = false;
  reviewError = '';
  notice = '';

  ngOnInit(): void {
    this.load();
  }

  setStatus(status: CategorySuggestionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.closeReview();
    this.load();
  }

  load(): void {
    this.loading = !this.suggestions.length;
    this.error = '';
    this.api.list(this.status).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.suggestions = res.suggestions;
        this.counts = res.counts;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.error || 'טעינת ההצעות נכשלה';
        this.loading = false;
      },
    });
  }

  openReview(item: CategorySuggestion, decision: 'approve' | 'reject'): void {
    this.reviewing = { item, decision };
    this.note = '';
    this.reviewError = '';
    this.notice = '';
    setTimeout(() => document.getElementById('cs-note')?.focus());
  }

  closeReview(): void {
    if (this.saving) return;
    this.reviewing = null;
    this.reviewError = '';
  }

  onNote(event: Event): void {
    this.note = (event.target as HTMLTextAreaElement).value;
  }

  confirm(): void {
    if (!this.reviewing || this.saving) return;
    const { item, decision } = this.reviewing;
    this.saving = true;
    this.reviewError = '';
    this.api.review(item.id, decision, this.note.trim() || undefined).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving = false;
        this.reviewing = null;
        this.notice = decision === 'approve'
          ? `ההצעה „${item.label}” אושרה. הרשימה הרשמית לא השתנתה — הוספת הקטגוריה תתבצע בנפרד.`
          : `ההצעה „${item.label}” נדחתה.`;
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.reviewError = err?.error?.error || 'שמירת ההחלטה נכשלה';
        if (err?.error?.code === 'ALREADY_REVIEWED') this.load();
      },
    });
  }
}
