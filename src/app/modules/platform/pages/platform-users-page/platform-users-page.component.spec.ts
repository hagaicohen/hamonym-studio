import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { PlatformUsersPageComponent } from './platform-users-page.component';
import { PlatformService } from '../../services/platform.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { AmbassadorService } from '../../../campaigns/services/ambassador.service';

// No spec file existed for this page before this pass -- kept deliberately
// minimal (the "⋮" actions-menu positioning fix only, not full page
// coverage). See platform-users-page.component.ts's own comments for the
// two-part history: 2026-09-16 switched the menu from `position: absolute`
// (clipped by .plat-table-wrap's overflow-x:auto) to `position: fixed`
// with a JS-computed viewport position; this follow-up clamps that
// position so a trigger near the physical LEFT edge of the page (which
// "פעולות", the trailing table column, always is in RTL) can no longer
// push the menu's own left edge into negative/off-screen coordinates.
describe('PlatformUsersPageComponent - "⋮" actions menu position clamp (2026-09-16 follow-up)', () => {
  const user = {
    id: 'user-1', email: 'user1@example.com', full_name: 'משתמש אחד', phone: null,
    role_id: 2, role_name: 'תורם', is_active: true, is_super_admin: false, email_verified: true,
    last_login_at: null, created_at: '2026-09-01T00:00:00.000Z', deleted_at: null,
    entities_count: 0, platform_permissions: null,
  };

  async function createComponent() {
    const platformStub = {
      getUsers: jasmine.createSpy('getUsers').and.returnValue(of({ users: [user], total: 1 })),
    };
    await TestBed.configureTestingModule({
      imports: [PlatformUsersPageComponent],
      providers: [
        { provide: PlatformService, useValue: platformStub },
        { provide: CurrentContextService, useValue: {} },
        { provide: EntitiesService, useValue: { getMyEntities: () => of({ entities: [] }) } },
        { provide: CurrentEntityService, useValue: { currentEntity: { set: () => {} }, setRole: () => {} } },
        { provide: AmbassadorService, useValue: { getMyCampaigns: () => of([]) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformUsersPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('opening the menu for a trigger near the left edge of the viewport keeps the menu fully on-screen (right clamped, never negative left edge)', async () => {
    const fixture = await createComponent();
    const trigger: HTMLElement = fixture.debugElement.query(By.css('.user-menu-trigger')).nativeElement;

    // Simulate exactly the reported case: a trigger sitting close to the
    // viewport's own left edge (the "פעולות" column, physically leftmost
    // in RTL) -- getBoundingClientRect stubbed directly since Karma's real
    // layout for this fixture won't naturally place it there.
    spyOn(trigger, 'getBoundingClientRect').and.returnValue({
      top: 300, bottom: 330, left: 60, right: 90, width: 30, height: 30, x: 60, y: 300, toJSON: () => ({}),
    } as DOMRect);
    spyOnProperty(window, 'innerWidth').and.returnValue(1000);

    trigger.click();
    fixture.detectChanges();

    const pos = fixture.componentInstance.menuPosition!;
    expect(pos).toBeTruthy();
    // Menu's own left edge = innerWidth - right - menuMinWidth(190) must
    // stay >= the 8px viewport margin, never negative/off-screen.
    const menuLeftEdge = 1000 - pos.right - 190;
    expect(menuLeftEdge).toBeGreaterThanOrEqual(8);
  });

  it('opening the menu for a trigger with plenty of room to its left keeps the original tight-to-trigger anchor (unclamped)', async () => {
    const fixture = await createComponent();
    const trigger: HTMLElement = fixture.debugElement.query(By.css('.user-menu-trigger')).nativeElement;

    spyOn(trigger, 'getBoundingClientRect').and.returnValue({
      top: 300, bottom: 330, left: 700, right: 730, width: 30, height: 30, x: 700, y: 300, toJSON: () => ({}),
    } as DOMRect);
    spyOnProperty(window, 'innerWidth').and.returnValue(1000);

    trigger.click();
    fixture.detectChanges();

    const pos = fixture.componentInstance.menuPosition!;
    expect(pos.right).toBe(1000 - 730); // exact trigger-anchored value, not clamped
  });
});
