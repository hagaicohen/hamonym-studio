import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

const FAILURE_REASONS = [
  'כרטיס פג תוקף',
  'סורב ע"י חברת אשראי',
  'שגיאת סליקה',
  'כרטיס חסום',
  'יתרה לא מספקת',
];

@Component({
  selector: 'app-mock-payment-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mock-payment-page.component.html',
  styleUrls: ['./mock-payment-page.component.css'],
})
export class MockPaymentPageComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private http   = inject(HttpClient);

  donationId  = '';
  session = '';
  amount      = 0;
  campaignTitle = '';
  slug        = '';

  status: 'paid' | 'failed' = 'paid';
  failureReason = FAILURE_REASONS[0];

  loading  = false;
  errorMsg = '';

  readonly failureReasons = FAILURE_REASONS;

  ngOnInit(): void {
    const p = this.route.snapshot.queryParamMap;
    this.donationId    = p.get('id')     || '';
    this.session       = p.get('session') || '';
    this.amount        = parseFloat(p.get('amount') || '0');
    this.slug          = p.get('slug')   || '';
    this.campaignTitle = p.get('title')  || '';
  }

  get formattedAmount(): string {
    return '₪' + this.amount.toLocaleString('he-IL');
  }

  submit(): void {
    if (this.loading) return;
    this.loading  = true;
    this.errorMsg = '';

    this.http.post<{ redirectUrl: string }>(
      `${environment.apiUrl}/api/donations/mock-complete`,
      {
        id:            this.donationId,
        session:       this.session,
        status:        this.status,
        failureReason: this.status === 'failed' ? this.failureReason : null,
      }
    ).subscribe({
      next: (res) => { window.location.href = res.redirectUrl; },
      error: (err) => {
        this.loading  = false;
        this.errorMsg = err?.error?.error || 'שגיאה בעיבוד';
      },
    });
  }
}
