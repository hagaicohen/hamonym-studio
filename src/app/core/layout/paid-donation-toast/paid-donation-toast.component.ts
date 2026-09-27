import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Subject, interval, of } from 'rxjs';
import { startWith, switchMap, takeUntil, catchError, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { CurrentEntityService } from '../../services/current-entity.service';

const POLL_MS = 3000;
const PAGE_LIMIT = 10;
const VISIBLE_MS = 6000;
const MAX_VISIBLE = 3;

interface PaidDonationRow {
  id: string;
  donor_name: string | null;
  amount: number;
  is_anonymous: boolean;
  campaign_title: string | null;
}

interface ToastItem {
  id: string;
  donorLabel: string;
  amount: number;
  campaignTitle: string;
  visible: boolean;
}

// Global "new donation arrived" toast (2026-09-27) — mounted once in
// AppLayoutComponent so it's visible regardless of which admin screen is
// open, reusing notification-bell.component.ts's own polling pattern
// (interval+startWith+switchMap+takeUntil) and donation-toast.component.ts's
// own visual queue/auto-dismiss mechanics, rather than inventing either from
// scratch. Deliberately its own small component instead of folding into the
// bell's dropdown-list UI -- a transient slide-in-and-vanish celebration and
// a persistent unread-badge inbox are different UI paradigms, and the bell's
// own EntityNotification model has no shape for "a donation, an amount, a
// campaign" anyway.
//
// Trigger condition (matches the product's own explicit safety rule): only
// donations.status='paid' as reported by the SAME backend-authoritative
// endpoint Checkout V2's own confirmation polling already uses
// (GET /api/donations/entity/:id?status=paid) -- never a bare page-load
// signal, HandleSubmit, or 'pending' row.
@Component({
  selector: 'app-paid-donation-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paid-donation-toast.component.html',
  styleUrl: './paid-donation-toast.component.css',
})
export class PaidDonationToastComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private currentEntity = inject(CurrentEntityService);
  private destroy$ = new Subject<void>();

  toasts: ToastItem[] = [];
  private seenIds = new Set<string>();
  private baselineDone = false;
  private lastEntityId: string | null = null;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  ngOnInit(): void {
    interval(POLL_MS).pipe(
      startWith(0),
      switchMap(() => this.fetchLatestPaid()),
      takeUntil(this.destroy$),
    ).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.timers.forEach(t => clearTimeout(t));
  }

  private fetchLatestPaid() {
    const entityId = this.currentEntity.currentEntity()?.id ?? null;
    // No entity context (e.g. admin switched to a different role/context) --
    // same no-op guard notification-bell.component.ts's own fetch() already
    // uses for its entity-scoped branch.
    if (!entityId) { this.lastEntityId = null; return of(null); }

    // Switching entities must never carry the previous entity's "already
    // seen" set forward -- otherwise every one of the new entity's existing
    // paid donations would look "new" and fire a popup storm.
    if (entityId !== this.lastEntityId) {
      this.lastEntityId = entityId;
      this.seenIds.clear();
      this.baselineDone = false;
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    const params = new HttpParams()
      .set('status', 'paid')
      // completedAt, not date/created_at -- a donation can sit 'pending' a
      // while (webhook lag) before flipping to 'paid', so sorting by
      // created_at could miss/misorder it relative to donations that
      // happened to confirm instantly (see donations.service.js's own
      // SORT_COLUMNS comment).
      .set('sortBy', 'completedAt')
      .set('sortDir', 'desc')
      .set('page', '0')
      .set('limit', String(PAGE_LIMIT));

    return this.http.get<{ donations: PaidDonationRow[] }>(
      `${environment.apiUrl}/api/donations/entity/${entityId}`,
      { headers, params },
    ).pipe(
      tap(res => this.handleResult(res.donations ?? [])),
      catchError(() => of(null)),
    );
  }

  private handleResult(rows: PaidDonationRow[]): void {
    if (!this.baselineDone) {
      // First poll after mount (or after switching entities) -- record
      // every already-paid donation silently. Never animate history; only
      // a donation that becomes newly visible AFTER this baseline qualifies.
      rows.forEach(r => this.seenIds.add(r.id));
      this.baselineDone = true;
      return;
    }

    // Oldest-first so several donations arriving close together queue in a
    // sane chronological order rather than reverse.
    const fresh = rows.filter(r => !this.seenIds.has(r.id)).reverse();
    for (const row of fresh) {
      this.seenIds.add(row.id);
      this.enqueue(row);
    }
  }

  private enqueue(row: PaidDonationRow): void {
    if (this.toasts.length >= MAX_VISIBLE) this.dismiss(this.toasts[0].id);

    const item: ToastItem = {
      id: row.id,
      donorLabel: row.is_anonymous || !row.donor_name ? 'תורם/ת אנונימי/ת' : row.donor_name,
      amount: Number(row.amount) || 0,
      campaignTitle: row.campaign_title || '',
      visible: false,
    };
    this.toasts.push(item);

    // Same fade-in-on-next-tick + timed auto-dismiss pattern as
    // donation-toast.component.ts's own add()/dismiss().
    setTimeout(() => { item.visible = true; }, 10);
    this.timers.set(item.id, setTimeout(() => this.dismiss(item.id), VISIBLE_MS));
  }

  dismiss(id: string): void {
    const item = this.toasts.find(t => t.id === id);
    if (!item) return;
    item.visible = false;

    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);

    setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 400);
  }
}
