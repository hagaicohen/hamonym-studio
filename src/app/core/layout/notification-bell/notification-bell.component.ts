import { Component, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, interval, of } from 'rxjs';
import { catchError, startWith, switchMap, takeUntil, tap } from 'rxjs/operators';
import { CurrentContextService } from '../../services/current-context.service';
import { CurrentEntityService } from '../../services/current-entity.service';
import { EntitiesService, EntityNotification } from '../../services/entities.service';
import { PlatformService } from '../../../modules/platform/services/platform.service';

const POLL_MS = 20000;

const ACTION_LABELS: Record<EntityNotification['action'], string> = {
  approve: 'העמותה שלכם אושרה 🎉',
  reject: 'הבקשה שלכם נדחתה',
  request_changes: 'נדרשים תיקונים בפרטי העמותה',
  suspend: 'העמותה הושעתה',
  reactivate: 'העמותה הופעלה מחדש',
};

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.css',
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  protected ctx = inject(CurrentContextService);
  private currentEntity = inject(CurrentEntityService);
  private entitiesApi = inject(EntitiesService);
  private platformApi = inject(PlatformService);
  private router = inject(Router);
  private el = inject(ElementRef);
  private destroy$ = new Subject<void>();

  readonly actionLabels = ACTION_LABELS;

  dropdownOpen = false;
  count = 0;
  notifications: EntityNotification[] = [];
  private acknowledgeTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    interval(POLL_MS).pipe(
      startWith(0),
      switchMap(() => this.fetch()),
      takeUntil(this.destroy$),
    ).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.acknowledgeTimer) clearTimeout(this.acknowledgeTimer);
  }

  private fetch() {
    if (this.ctx.adminMode()) {
      return this.platformApi.getNotificationsCount().pipe(
        tap(r => { this.count = r.pendingReviewCount; }),
        catchError(() => { this.count = 0; return of(null); }),
      );
    }
    const entityId = this.currentEntity.currentEntity()?.id;
    if (!entityId) { this.count = 0; this.notifications = []; return of(null); }
    return this.entitiesApi.getNotifications(entityId).pipe(
      tap(r => { this.notifications = r.notifications; this.count = r.notifications.length; }),
      catchError(() => { this.count = 0; return of(null); }),
    );
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;

    // Give the manager a moment to actually see which notifications are new
    // (still bold/highlighted) before they're marked read and the badge
    // disappears — mirrors an email inbox, not an instant silent dismiss.
    if (this.dropdownOpen && !this.ctx.adminMode() && this.count > 0) {
      const entityId = this.currentEntity.currentEntity()?.id;
      if (entityId) {
        if (this.acknowledgeTimer) clearTimeout(this.acknowledgeTimer);
        this.acknowledgeTimer = setTimeout(() => {
          this.entitiesApi.acknowledgeNotifications(entityId).subscribe(() => { this.count = 0; });
        }, 1800);
      }
    }
  }

  goToPendingReview(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen = false;
    this.router.navigate(['/platform/organizations'], { queryParams: { status: 'pending_review' } });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) this.dropdownOpen = false;
  }
}
