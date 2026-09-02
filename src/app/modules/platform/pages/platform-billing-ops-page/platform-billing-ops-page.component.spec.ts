import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PlatformBillingOpsPageComponent } from './platform-billing-ops-page.component';
import { BillingOpsService, BlockedBillingEntity, StatementListItem } from '../../services/billing-ops.service';

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

// Bulk-approval workflow (current-period table): select-all/individual
// checkboxes are only offered on eligible ('draft') Statements, the primary
// action calls the new orchestration endpoint once with every selected id
// (never one HTTP call per Statement, never a direct status mutation from
// the frontend), and the compact result summary reflects exactly what the
// endpoint reports per id -- including the "X approved" / "Y needs
// attention" split when the batch is not a clean sweep.
describe('PlatformBillingOpsPageComponent - bulk approval', () => {
  const period = {
    id: 'period-aug-2026',
    period_start: '2026-08-01T00:00:00.000Z',
    period_end: '2026-09-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    retired: false,
    run_count: 1,
  };

  function statement(id: string, status: string): StatementListItem {
    return {
      id,
      billing_account_id: `acct-${id}`,
      billing_period_id: period.id,
      billing_run_id: 'run-1',
      gross_raised: '100.00',
      fee_amount: '3.00',
      vat_amount: '0.54',
      total_due: '3.54',
      status,
      created_at: '2026-09-01T00:00:00.000Z',
      entity_id: `entity-${id}`,
      entity_name: `עמותה ${id}`,
      component_count: 2,
      routed_method: 'card',
      latest_attempt_status: null,
      payment_count: 0,
    };
  }

  const draftA = statement('stmt-a', 'draft');
  const draftB = statement('stmt-b', 'draft');
  const approvedC = statement('stmt-c', 'approved');

  function stubService(overrides: Partial<ReturnType<typeof baseStub>> = {}) {
    return { ...baseStub(), ...overrides };
  }

  function baseStub() {
    return {
      listPeriods: () => of({ periods: [period] }),
      listRuns: () =>
        of({
          runs: [{
            id: 'run-1', billing_period_id: period.id, mode: 'production' as const,
            as_of: period.period_start, status: 'completed',
            result_summary: { accountsEvaluated: 3, statementsCreated: 3, zeroActivityAccountIds: [], errors: [] },
            created_at: period.period_start, completed_at: period.period_start,
          }],
        }),
      listStatements: () => of({ statements: [draftA, draftB, approvedC] }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
      bulkApproveStatements: jasmine.createSpy('bulkApproveStatements'),
    };
  }

  async function setup(overrides: Partial<ReturnType<typeof baseStub>> = {}) {
    const service = stubService(overrides);
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    return { fixture, service };
  }

  it('only offers a checkbox for draft (eligible) Statements, not for already-approved ones', async () => {
    const { fixture } = await setup();
    const rows = fixture.debugElement.queryAll(By.css('.bo-table tbody tr'));
    expect(rows.length).toBe(3);
    expect(rows[0].queryAll(By.css('input[type="checkbox"]')).length).toBe(1); // draftA
    expect(rows[1].queryAll(By.css('input[type="checkbox"]')).length).toBe(1); // draftB
    expect(rows[2].queryAll(By.css('input[type="checkbox"]')).length).toBe(0); // approvedC
  });

  it('select-all selects every eligible draft Statement and the button reflects the count, e.g. "אשר 2 חשבונות"', async () => {
    const { fixture } = await setup();
    const selectAll = fixture.debugElement.query(By.css('thead input[type="checkbox"]'));
    selectAll.nativeElement.checked = true;
    selectAll.triggerEventHandler('change', null);
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.bo-bulk-approval-bar button'));
    expect(button.nativeElement.textContent.trim()).toBe('אשר 2 חשבונות');
  });

  it('clicking the primary action calls the bulk endpoint exactly once with every selected id -- never a per-Statement call', async () => {
    const { fixture, service } = await setup({
      bulkApproveStatements: jasmine.createSpy().and.returnValue(
        of({ result: { total: 2, approvedCount: 2, failedCount: 0, results: [] } }),
      ),
    });

    const checkboxes = fixture.debugElement.queryAll(By.css('.bo-table tbody input[type="checkbox"]'));
    checkboxes[0].nativeElement.checked = true;
    checkboxes[0].triggerEventHandler('change', null);
    checkboxes[1].nativeElement.checked = true;
    checkboxes[1].triggerEventHandler('change', null);
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.bo-bulk-approval-bar button'));
    button.nativeElement.click();
    fixture.detectChanges();

    expect(service.bulkApproveStatements).toHaveBeenCalledTimes(1);
    expect(service.bulkApproveStatements).toHaveBeenCalledWith(['stmt-a', 'stmt-b']);
  });

  it('shows the compact mixed-result summary -- "1 חשבון אושר" and "1 חשבון דורש טיפול" -- when one of two fails', async () => {
    const { fixture } = await setup({
      bulkApproveStatements: jasmine.createSpy().and.returnValue(
        of({
          result: {
            total: 2, approvedCount: 1, failedCount: 1,
            results: [
              { id: 'stmt-a', success: true, result: { approved: true } },
              { id: 'stmt-b', success: false, error: { code: 'DONATION_ALREADY_CLAIMED_BY_OTHER_STATEMENT', message: 'x' } },
            ],
          },
        }),
      ),
    });

    const checkboxes = fixture.debugElement.queryAll(By.css('.bo-table tbody input[type="checkbox"]'));
    checkboxes[0].nativeElement.checked = true;
    checkboxes[0].triggerEventHandler('change', null);
    checkboxes[1].nativeElement.checked = true;
    checkboxes[1].triggerEventHandler('change', null);
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.bo-bulk-approval-bar button')).nativeElement.click();
    fixture.detectChanges();

    const result = fixture.debugElement.query(By.css('.bo-bulk-approval-result'));
    expect(result.nativeElement.textContent).toContain('1 חשבון אושר');
    expect(result.nativeElement.textContent).toContain('1 חשבון דורש טיפול');
  });

  it('the primary action button is disabled when nothing is selected', async () => {
    const { fixture } = await setup();
    const button = fixture.debugElement.query(By.css('.bo-bulk-approval-bar button'));
    expect(button.nativeElement.disabled).toBe(true);
  });

  it('clicking the entity/account row action still opens the individual review drawer (unchanged path)', async () => {
    const { fixture, service } = await setup();
    (service as any).getStatement = jasmine.createSpy().and.returnValue(of({ statement: { ...draftA, attempts: [], payments: [], componentCount: 2, account_declared_method: 'card' } }));

    const detailButtons = fixture.debugElement.queryAll(By.css('.bo-table tbody button'));
    detailButtons[0].nativeElement.click();
    fixture.detectChanges();

    expect((service as any).getStatement).toHaveBeenCalledWith('stmt-a');
  });
});
