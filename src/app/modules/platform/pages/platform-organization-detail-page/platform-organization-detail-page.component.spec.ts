import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { PlatformOrganizationDetailPageComponent } from './platform-organization-detail-page.component';
import { PlatformService } from '../../services/platform.service';

// No spec file existed for this page before this pass -- kept deliberately
// minimal (loading-state behavior only, not full page coverage), per the
// 2026-09-16 loading-state audit's highest-impact finding: load() used to
// set `loading = true` unconditionally, so approve/reject/suspend/
// reactivate/AI-access-toggle actions blanked the *entire* detail page
// (all tabs, KPIs, history) while refetching, not just a table.
describe('PlatformOrganizationDetailPageComponent - loading vs. refreshing (2026-09-16 fix)', () => {
  const entity = {
    id: 'entity-a', display_name: 'עמותת א', status: 'pending_review',
    logo_url: null, ai_features_enabled: false,
  };

  async function createComponent(overrides: { getOrganization?: any } = {}) {
    const route = { snapshot: { paramMap: convertToParamMap({ id: 'entity-a' }) } };
    const platformStub = {
      getOrganization: jasmine.createSpy('getOrganization').and.returnValue(
        of({ entity, users: [], campaigns: [], ambassadors: [], donations: [], donationsKpi: null, auditLog: [], donorCount: 0 }),
      ),
      approve: jasmine.createSpy('approve'),
      reject: jasmine.createSpy('reject'),
      requestChanges: jasmine.createSpy('requestChanges'),
      suspend: jasmine.createSpy('suspend'),
      reactivate: jasmine.createSpy('reactivate'),
      setAiAccess: jasmine.createSpy('setAiAccess'),
      ...overrides,
    };

    await TestBed.configureTestingModule({
      imports: [PlatformOrganizationDetailPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: route },
        { provide: PlatformService, useValue: platformStub },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformOrganizationDetailPageComponent);
    fixture.detectChanges();
    return { fixture, platformStub };
  }

  it('true first load shows the loading placeholder, no page content yet', async () => {
    const getOrganization$ = new Subject<any>();
    const { fixture } = await createComponent({ getOrganization: () => getOrganization$ });

    expect(fixture.componentInstance.loading).toBe(true);
    expect(fixture.debugElement.query(By.css('.plat-loading'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.plat-header'))).toBeFalsy();

    getOrganization$.next({ entity, users: [], campaigns: [], ambassadors: [], donations: [], donationsKpi: null, auditLog: [], donorCount: 0 });
    getOrganization$.complete();
    fixture.detectChanges();
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.debugElement.query(By.css('.plat-header'))).toBeTruthy();
  });

  it('approve() reloads via load(), which never flips loading back to true once the page is already showing -- refreshing dims it instead', async () => {
    const reload$ = new Subject<any>();
    const { fixture, platformStub } = await createComponent();
    (platformStub.approve as jasmine.Spy).and.returnValue(of({}));

    // Real page already loaded.
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.debugElement.query(By.css('.plat-header'))).toBeTruthy();

    // Make the reload triggered by approve()'s own load() call controllable.
    (platformStub.getOrganization as jasmine.Spy).and.returnValue(reload$);

    fixture.componentInstance.approve();
    fixture.detectChanges();

    // Never blanks the page -- loading stays false, refreshing dims it.
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.componentInstance.refreshing).toBe(true);
    expect(fixture.debugElement.query(By.css('.plat-header'))).toBeTruthy(); // still there
    expect(fixture.debugElement.query(By.css('.plat-page')).nativeElement.classList).toContain('refreshing');
    expect(fixture.nativeElement.textContent).not.toContain('טוען...');

    reload$.next({ entity, users: [], campaigns: [], ambassadors: [], donations: [], donationsKpi: null, auditLog: [], donorCount: 0 });
    reload$.complete();
    fixture.detectChanges();
    expect(fixture.componentInstance.refreshing).toBe(false);
  });

  it('an action failure (e.g. approve() rejecting) shows inline near the action buttons -- never blanks the whole page via the page-load `error`', async () => {
    const { fixture, platformStub } = await createComponent();
    (platformStub.approve as jasmine.Spy).and.callFake(() => {
      const s = new Subject<any>();
      queueMicrotask(() => s.error({ error: { error: 'הפעולה נכשלה' } }));
      return s;
    });

    fixture.componentInstance.approve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.error).toBeNull(); // page-load error untouched
    expect(fixture.componentInstance.actionError).toBe('הפעולה נכשלה');
    expect(fixture.debugElement.query(By.css('.plat-header'))).toBeTruthy(); // page still fully visible
    expect(fixture.debugElement.query(By.css('.plat-error'))).toBeFalsy(); // no page-level takeover
  });

  it('toggleAiAccess() reload also refreshes in place, not a blank page', async () => {
    const reload$ = new Subject<any>();
    const { fixture, platformStub } = await createComponent();
    (platformStub.setAiAccess as jasmine.Spy).and.returnValue(of({}));
    (platformStub.getOrganization as jasmine.Spy).and.returnValue(reload$);

    fixture.componentInstance.toggleAiAccess();
    fixture.detectChanges();

    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.componentInstance.refreshing).toBe(true);
    expect(fixture.debugElement.query(By.css('.plat-header'))).toBeTruthy();
  });
});
