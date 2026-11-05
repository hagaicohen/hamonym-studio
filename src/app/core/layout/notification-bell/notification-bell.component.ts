import { Component, ElementRef, HostListener, OnDestroy, OnInit, inject, computed } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, interval, of, merge } from 'rxjs';
import { catchError, startWith, switchMap, takeUntil, tap } from 'rxjs/operators';
import { CurrentContextService } from '../../services/current-context.service';
import { CurrentEntityService } from '../../services/current-entity.service';
import { EntitiesService, EntityNotification } from '../../services/entities.service';
import { PlatformService } from '../../../modules/platform/services/platform.service';

import { HmIconComponent } from '../../../shared/ui/design-system/icon.component';
const POLL_MS = 20000;

const ACTION_LABELS: Record<EntityNotification['action'], string> = {
  approve: 'העמותה שלכם אושרה',
  reject: 'הבקשה שלכם נדחתה',
  request_changes: 'נדרשים תיקונים בפרטי העמותה',
  suspend: 'העמותה הושעתה',
  reactivate: 'העמותה הופעלה מחדש',
};

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [HmIconComponent, CommonModule],
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
  private contextChanges = toObservable(computed(() => `${this.ctx.adminMode()}_${this.currentEntity.currentEntity()?.id ?? ''}`));
  private notificationScope = '';

  readonly actionLabels = ACTION_LABELS;

  dropdownOpen = false;
  count = 0;
  pendingReviewCount = 0;
  flaggedForReviewCount = 0;
  notifications: EntityNotification[] = [];
  private acknowledgeTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    merge(interval(POLL_MS), this.contextChanges).pipe(
      startWith(0),
      tap(() => {
        const scope = `${this.ctx.adminMode()}_${this.currentEntity.currentEntity()?.id ?? ''}`;
        if (scope !== this.notificationScope) {
          this.notificationScope = scope;
          this.count = 0;
          this.notifications = [];
          this.dropdownOpen = false;
          if (this.acknowledgeTimer) clearTimeout(this.acknowledgeTimer);
        }
      }),
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
        tap(r => {
          this.pendingReviewCount = r.pendingReviewCount;
          this.flaggedForReviewCount = r.flaggedForReviewCount;
          // Saved drafts are not submitted review requests.
          this.count = r.pendingReviewCount + r.flaggedForReviewCount;
        }),
        catchError(() => {
          this.count = 0;
          this.pendingReviewCount = 0;
          this.flaggedForReviewCount = 0;
          return of(null);
        }),
      );
    }
    const entityId = this.currentEntity.currentEntity()?.id;
    if (!entityId) { this.count = 0; this.notifications = []; return of(null); }
    return this.entitiesApi.getNotifications(entityId).pipe(
      tap(r => {
        if (this.currentEntity.currentEntity()?.id !== entityId) return;
        this.notifications = r.notifications;
        this.count = r.notifications.length;
        // A notification means a Super Admin action (approve/reject/suspend/...)
        // changed this entity server-side -- CurrentEntityService otherwise only
        // ever re-fetches on context switch (see its own effect()), so a manager
        // sitting on an already-open tab would keep seeing the stale pending/
        // suspended state (and the gates tied to it, e.g. campaign publish)
        // even after being told right here that it changed.
        if (r.notifications.length > 0) {
          this.entitiesApi.getEntityById(entityId).subscribe({
            next: (entity) => {
              const active = this.ctx.active();
              if (active?.role === 'entity-manager' && active.context?.id === entityId) this.currentEntity.setEntity(entity);
            },
          });
        }
      }),
      catchError(() => {
        if (this.currentEntity.currentEntity()?.id === entityId) { this.count = 0; this.notifications = []; }
        return of(null);
      }),
    );
  }

  // Both modes now open the same dropdown — a plain navigate-away used to
  // be a no-op whenever the admin clicked the bell while already sitting on
  // /platform, which looked like the bell did nothing. See DECISIONS.md
  // (2026-07-20).
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
          this.entitiesApi.acknowledgeNotifications(entityId).subscribe(() => { if (this.currentEntity.currentEntity()?.id === entityId) this.count = 0; });
        }, 1800);
      }
    }
  }

  goToOrganizations(status: 'pending_review' | 'draft', event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen = false;
    this.router.navigate(['/platform/organizations'], { queryParams: { status } });
  }

  goToFlaggedOrganizations(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen = false;
    this.router.navigate(['/platform/organizations'], { queryParams: { flaggedForReview: '1' } });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) this.dropdownOpen = false;
  }
}
