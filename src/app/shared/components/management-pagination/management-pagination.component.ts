import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-management-pagination',
  standalone: true,
  template: `
    <nav aria-label="דפדוף בתוצאות">
      <span>{{ total ? page * pageSize + 1 : 0 }}–{{ end }} מתוך {{ total }}</span>
      <div>
        <button type="button" class="desktop" [disabled]="page === 0" (click)="select(0)">ראשון</button>
        <button type="button" [disabled]="page === 0" (click)="select(page - 1)">הקודם</button>
        @for (index of visiblePages; track index) {
          <button type="button" class="desktop" [attr.aria-current]="index === page ? 'page' : null" (click)="select(index)">{{ index + 1 }}</button>
        }
        <span class="mobile">עמוד {{ page + 1 }} מתוך {{ pages }}</span>
        <button type="button" [disabled]="page >= pages - 1" (click)="select(page + 1)">הבא</button>
        <button type="button" class="desktop" [disabled]="page >= pages - 1" (click)="select(pages - 1)">אחרון</button>
      </div>
    </nav>
  `,
  styles: [`
    nav, nav > div { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    nav { justify-content: space-between; padding-block-start: 14px; color: var(--campaign-muted); font-size: 12px; }
    button { border: 1px solid var(--hm-border); border-radius: 7px; min-height: 34px; padding: 5px 8px; background: white; color: var(--hm-text); font: inherit; }
    button[aria-current='page'] { color: var(--hm-admin-primary); border-color: var(--hm-admin-selected-border); background: var(--hm-admin-primary-soft); }
    button:disabled { opacity: .45; }
    .mobile { display: none; }
    @media (max-width: 700px) { .desktop { display: none; } .mobile { display: inline; } }
  `],
})
export class ManagementPaginationComponent {
  @Input({ required: true }) page = 0;
  @Input({ required: true }) total = 0;
  @Input() pageSize = 25;
  @Output() pageChange = new EventEmitter<number>();

  get pages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get end(): number { return Math.min(this.total, (this.page + 1) * this.pageSize); }
  get visiblePages(): number[] {
    const start = Math.max(0, Math.min(this.page - 2, this.pages - 5));
    return Array.from({ length: Math.min(5, this.pages) }, (_, offset) => start + offset);
  }

  select(page: number): void {
    if (page !== this.page && page >= 0 && page < this.pages) this.pageChange.emit(page);
  }
}
