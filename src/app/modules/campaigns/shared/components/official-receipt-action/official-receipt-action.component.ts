import { Component, Input, OnChanges, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DonationService } from '../../../services/donation.service';

@Component({
  selector: 'app-official-receipt-action', standalone: true, imports: [RouterLink],
  template: `<span (click)="$event.stopPropagation()">
    @if (iconMode || buttonMode) {
      <span class="receipt-action">
        <button type="button" class="receipt-icon" [disabled]="!available || downloading"
          [attr.aria-label]="available ? 'הורדת קבלה' : 'קבלה לא זמינה'"
          [title]="available ? 'הורדת קבלה' : 'קבלה לא זמינה'" (click)="download()">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h4"/>
          </svg>
          @if (buttonMode) { <span>הורדת קבלה</span> }
        </button>
        @if (!available) { <small>לא זמינה</small> }
        @if (downloadError) { <small role="alert">לא ניתן להוריד כרגע</small> }
      </span>
    } @else {
    @if (available && receiptId) { <a [routerLink]="['/receipts', receiptId]">צפייה בקבלה</a> }
    @else { <span class="unavailable">הקבלה טרם זמינה</span>
      @if (receiptId && authenticated) { <a class="retry" [routerLink]="['/receipts', receiptId]">בדיקת זמינות</a> }
    }}</span>`,
  styles: ['a {color:#583cd6;font-weight:600;} .unavailable {color:#64748b;font-size:13px;} .retry {display:block;font-size:12px;} .receipt-action {display:inline-flex;align-items:center;gap:6px;white-space:nowrap;} .receipt-icon {display:inline-flex;align-items:center;justify-content:center;min-width:36px;min-height:36px;padding:6px;border:1px solid #e5defa;border-radius:8px;background:#faf8ff;color:#583cd6;cursor:pointer;} .receipt-icon:hover:not(:disabled) {background:#eee8ff;} .receipt-icon:focus-visible {outline:2px solid #583cd6;outline-offset:2px;} .receipt-icon:disabled {color:#a3aab7;background:#f8fafc;border-color:#edf0f4;cursor:default;} small {color:#8791a2;font-size:11px;}'],
})
export class OfficialReceiptActionComponent implements OnChanges {
  @Input() receiptId: string | null | undefined;
  @Input() iconMode = false;
  @Input() buttonMode = false;
  private donations = inject(DonationService);
  available = false;
  downloading = false;
  downloadError = false;
  download(): void {
    if (!this.receiptId || !this.available || this.downloading) return;
    this.downloading = true;
    this.downloadError = false;
    this.donations.getReceiptPdf(this.receiptId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = 'receipt.pdf'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.downloading = false;
      },
      error: () => { this.downloading = false; this.downloadError = true; },
    });
  }
  get authenticated(): boolean { return !!localStorage.getItem('token'); }
  ngOnChanges(): void {
    this.available = false;
    const id = this.receiptId;
    if (!id || !this.authenticated) return;
    this.donations.getReceipt(id).subscribe({
      next: result => { if (this.receiptId === id) this.available = result.available; },
      error: () => { if (this.receiptId === id) this.available = false; },
    });
  }
}
