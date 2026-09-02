import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PlatformBillingOpsPageComponent } from './platform-billing-ops-page.component';
import { BillingOpsService, BlockedBillingEntity } from '../../services/billing-ops.service';

// Regression test for the exact acceptance-criterion workflow: a Super
// Admin looking at the current Billing period sees "גדולים מהחיים —
// נדרשת הגדרת חיוב" and clicks the setup action. Before this fix, the
// routerLink pointed at the generic /platform/billing-accounts list, which
// dumped the operator into an unrelated screen instead of a focused,
// entity-specific setup flow -- this test exercises real Angular Router URL
// resolution (not just a template string) to prove the rendered link now
// resolves to that exact entity's focused setup screen.
describe('PlatformBillingOpsPageComponent - blocked entity setup link', () => {
  const blockedEntity: BlockedBillingEntity = {
    entityId: 'entity-gedolim-mehachaim',
    displayName: 'גדולים מהחיים',
    donationCount: 8,
    grossAmount: '207.00',
    reason: 'no_billing_account',
  };

  const suspendedEntity: BlockedBillingEntity = {
    entityId: 'entity-suspended',
    displayName: 'עמותה מושהית',
    donationCount: 3,
    grossAmount: '90.00',
    reason: 'account_suspended',
  };

  function stubService() {
    return {
      listPeriods: () =>
        of({
          periods: [
            {
              id: 'period-aug-2026',
              period_start: '2026-08-01T00:00:00.000Z',
              period_end: '2026-09-01T00:00:00.000Z',
              created_at: '2026-08-01T00:00:00.000Z',
              retired: false,
              run_count: 1,
            },
          ],
        }),
      listRuns: () =>
        of({
          runs: [
            {
              id: 'run-1',
              billing_period_id: 'period-aug-2026',
              mode: 'production' as const,
              as_of: '2026-09-01T00:00:00.000Z',
              status: 'completed',
              result_summary: {
                accountsEvaluated: 1,
                statementsCreated: 0,
                zeroActivityAccountIds: [],
                errors: [],
                activityDiscovered: { entitiesWithActivity: 2, totalDonations: 13, totalGross: 215 },
                blockedEntities: [blockedEntity, suspendedEntity],
              },
              created_at: '2026-09-01T00:00:00.000Z',
              completed_at: '2026-09-01T00:05:00.000Z',
            },
          ],
        }),
      listStatements: () => of({ statements: [] }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
    };
  }

  it('resolves the no_billing_account setup action to /platform/billing-setup/<entityId> for that exact entity, carrying its display data along', async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), { provide: BillingOpsService, useValue: stubService() }],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();

    const links = fixture.debugElement.queryAll(By.css('.bo-blocked-item a.ops-btn'));
    expect(links.length).toBe(1); // only the no_billing_account entity gets an action link

    const href = links[0].nativeElement.getAttribute('href') as string;

    expect(href).toContain('/platform/billing-setup/entity-gedolim-mehachaim');
    expect(href).not.toContain('/platform/billing-accounts');
    expect(href).not.toContain('/platform/organizations');

    // The focused setup screen must receive enough context to render
    // immediately without a second lookup -- this is what lets the operator
    // land on "הגדרות חיוב — גדולים מהחיים" instead of a bare entity id.
    expect(href).toContain(encodeURIComponent('גדולים מהחיים'));
    expect(href).toContain('donationCount=8');
  });

  it('does not offer a setup link for an account_suspended entity -- that path stays a manual note, unchanged', async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), { provide: BillingOpsService, useValue: stubService() }],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();

    const manualNotes = fixture.debugElement.queryAll(By.css('.bo-blocked-manual-note'));
    expect(manualNotes.length).toBe(1);
    expect(manualNotes[0].nativeElement.textContent).toContain('טיפול ידני');

    const links = fixture.debugElement.queryAll(By.css('.bo-blocked-item a.ops-btn'));
    expect(links.some((l) => (l.nativeElement.getAttribute('href') as string).includes('entity-suspended'))).toBe(false);
  });

  it('shows a return-to-workflow confirmation banner when arriving back from a completed setup, without the operator searching for the entity again', async () => {
    const activatedRouteStub = {
      snapshot: {
        queryParamMap: {
          get: (key: string) =>
            key === 'justSetupName' ? 'גדולים מהחיים' : key === 'justSetupEntity' ? 'entity-gedolim-mehachaim' : null,
        },
      },
    };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [
        provideRouter([]),
        { provide: BillingOpsService, useValue: stubService() },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.bo-just-setup-banner'));
    expect(banner).toBeTruthy();
    expect(banner.nativeElement.textContent).toContain('גדולים מהחיים');
  });
});
