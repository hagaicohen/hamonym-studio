import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

// Mirrors recurring_instructions.status as-is (hamonym-backend/src/modules/donations/recurring.service.js)
// plus the Provisional 'inactive' fallback (docs/CARDCOM_RECURRING_ARCHITECTURE.md) —
// donor-facing label mapping lives in recurringStatusLabel below, never in the DB.
export type RecurringStatus =
  | 'active' | 'paused' | 'cancelled' | 'completed'
  | 'pending_payment' | 'pending_creation' | 'creation_failed' | 'inactive';

const STATUS_LABELS: Record<RecurringStatus, string> = {
  active: 'פעילה',
  paused: 'מושהית',
  cancelled: 'בוטלה',
  completed: 'הסתיימה',
  pending_payment: 'בהקמה',
  pending_creation: 'בהקמה',
  creation_failed: 'לא הופעלה',
  inactive: 'לא פעילה',
};

export function recurringStatusLabel(status: string): string {
  return STATUS_LABELS[status as RecurringStatus] ?? status;
}

export interface MyRecurringInstruction {
  id: string;
  status: RecurringStatus;
  amount: string | number;
  next_date_to_bill: string | null;
  total_installments: number | null;
  paid_count: number;
  // Computed server-side (nextOccurrenceOfAnchorDay) — only present when
  // status='paused'. Never recompute this on the frontend; billing_anchor_day
  // logic lives in one place only, hamonym-backend/recurring.service.js.
  resume_preview_next_date_to_bill: string | null;
  campaign_title: string;
  campaign_slug: string;
  cover_image_url: string | null;
  entity_name: string;
  entity_logo: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface RecurringCharge {
  id: string;
  amount: string | number;
  completed_at: string;
  receipt_id: string | null;
}

@Injectable({ providedIn: 'root' })
export class RecurringService {
  private http   = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/recurring`;

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  }

  getMyRecurring(): Observable<MyRecurringInstruction[]> {
    return this.http.get<{ instructions: MyRecurringInstruction[] }>(`${this.apiUrl}/my`, { headers: this.authHeaders() })
      .pipe(map(r => r.instructions ?? []));
  }

  getHistory(instructionId: string): Observable<RecurringCharge[]> {
    return this.http.get<{ history: RecurringCharge[] }>(`${this.apiUrl}/${instructionId}/history`, { headers: this.authHeaders() })
      .pipe(map(r => r.history ?? []));
  }
}
