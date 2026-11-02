import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ApprovalStatusCardComponent } from './modules/settings/components/approval-status-card/approval-status-card.component';
import { NotificationBellComponent } from './core/layout/notification-bell/notification-bell.component';
import { CurrentEntityService } from './core/services/current-entity.service';
import { CurrentContextService } from './core/services/current-context.service';
import { EntitiesService } from './core/services/entities.service';
import { PlatformService } from './modules/platform/services/platform.service';

describe('Existing organization decision warnings', () => {
 beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]),
  { provide: EntitiesService, useValue: { getNotifications: () => of({ notifications: [] }) } },
  { provide: PlatformService, useValue: {} },
  { provide: CurrentEntityService, useValue: { currentEntity: signal({ id: 'org' }) } },
  { provide: CurrentContextService, useValue: { adminMode: signal(false) } },
 ] }));
 for (const status of ['rejected', 'changes_requested']) {
  it(`shows the current ${status} next step without changing resubmission availability`, () => {
   const fixture = TestBed.createComponent(ApprovalStatusCardComponent);
   fixture.componentInstance.loading = false;
   fixture.componentInstance.data = { status, comment: 'Admin explanation', updatedAt: '2026-11-01T08:00:00Z', reasonTags: [], actionBy: 'Admin' };
   fixture.detectChanges();
   const text = fixture.nativeElement.textContent;
   expect(text).toContain('Admin explanation');
   if (status === 'rejected') {
    expect(text).toContain('לא מחקה');
    expect(fixture.nativeElement.querySelector('.approval-resubmit-btn')).toBeNull();
   } else {
    expect(text).toContain('בהגדרות העמותה ושמרו');
    expect(fixture.nativeElement.querySelector('.approval-resubmit-btn')).not.toBeNull();
   }
   fixture.destroy();
  });
 }
 for (const action of ['reject', 'request_changes', 'approve'] as const) {
  it(`adds explanatory copy to existing ${action} bell messages only`, () => {
   const fixture = TestBed.createComponent(NotificationBellComponent);
   fixture.detectChanges();
   fixture.componentInstance.notifications = [{ id: 1, action, notes: 'Admin explanation', reasonTags: [], createdAt: '2026-11-01T08:00:00Z', actorName: 'Admin' }];
   fixture.componentInstance.count = 1; fixture.componentInstance.dropdownOpen = true;
   fixture.detectChanges();
   const text = fixture.nativeElement.textContent;
   expect(text).toContain('Admin explanation');
   expect(text).toContain(action === 'reject' ? 'העמותה והנתונים שלה נשמרו' : action === 'request_changes' ? 'שלח לבדיקה מחדש' : 'לניהול הקמפיינים');
   expect(fixture.componentInstance.notifications[0].action).toBe(action);
   fixture.destroy();
  });
 }
});
