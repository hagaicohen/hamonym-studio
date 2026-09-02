import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PlatformBillingOpsPageComponent } from './platform-billing-ops-page.component';
import { BillingOpsService, BlockedBillingEntity, StatementListItem, StatementDetail } from '../../services/billing-ops.service';

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

// Period-summary KPI tiles regression (2026-09-02): the top KPI row
// ("13 תרומות | ₪215.00 מחזור | 2 עמותות") must represent the period's total
// historical activity and stay stable across the whole Statement lifecycle
// (draft -> approved -> collection -> paid), not just "activity still
// eligible for a future Calculation run" -- which is what
// billing_runs.result_summary.activityDiscovered actually measures (it's
// computed with `effective_statement_id IS NULL` and correctly drops to 0
// once every donation in the period has been claimed by an approved
// Statement). Real production case that surfaced this: the real August
// period had activityDiscovered 13/₪215/2 right after Calculation: the
// operator then bulk-approved both real Statements, a later Calculation run
// on the same period (its own concern, not what this test proves) found 0
// remaining eligible activity for those two now-fully-claimed entities, and
// because the KPI blindly read the *latest* run's activityDiscovered, the
// tiles went to 0/0/0 while the Statement table directly below still showed
// 13/₪215/2 correctly.
describe('PlatformBillingOpsPageComponent - period-summary KPI tiles', () => {
  const period = {
    id: 'period-aug-2026',
    period_start: '2026-08-01T00:00:00.000Z',
    period_end: '2026-09-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    retired: false,
    run_count: 1,
  };

  function stmt(id: string, entityId: string, donationCount: number, gross: string, status = 'draft'): StatementListItem {
    return {
      id,
      billing_account_id: `acct-${entityId}`,
      billing_period_id: period.id,
      billing_run_id: 'run-1',
      gross_raised: gross,
      fee_amount: '0.00',
      vat_amount: '0.00',
      total_due: '0.00',
      status,
      created_at: period.period_start,
      entity_id: entityId,
      entity_name: `עמותה ${entityId}`,
      component_count: donationCount,
      routed_method: 'card',
      latest_attempt_status: null,
      payment_count: 0,
    };
  }

  function runWith(resultSummary: any) {
    return {
      id: 'run-1', billing_period_id: period.id, mode: 'production' as const,
      as_of: period.period_start, status: 'completed',
      result_summary: resultSummary,
      created_at: period.period_start, completed_at: period.period_start,
    };
  }

  async function setup(statements: StatementListItem[], run: any) {
    const service = {
      listPeriods: () => of({ periods: [period] }),
      listRuns: () => of({ runs: [run] }),
      listStatements: () => of({ statements }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('before approval: draft Statements + a run whose activityDiscovered is still unclaimed reads 13 / ₪215 / 2', async () => {
    const statements = [
      stmt('stmt-a', 'entity-gedolim', 8, '207.00', 'draft'),
      stmt('stmt-b', 'entity-israels', 5, '8.00', 'draft'),
    ];
    const run = runWith({
      accountsEvaluated: 2, statementsCreated: 2, zeroActivityAccountIds: [], errors: [],
      activityDiscovered: { entitiesWithActivity: 2, totalDonations: 13, totalGross: 215 },
      blockedEntities: [],
    });
    const component = await setup(statements, run);

    expect(component.periodDonationsCount(period)).toBe(13);
    expect(component.periodGrossAmount(period)).toBe(215);
    expect(component.periodEntitiesCount(period)).toBe(2);
  });

  it('after approval, same underlying activity, no new calculation: still reads 13 / ₪215 / 2 -- not 0', async () => {
    const statements = [
      stmt('stmt-a', 'entity-gedolim', 8, '207.00', 'approved'),
      stmt('stmt-b', 'entity-israels', 5, '8.00', 'approved'),
    ];
    // Same run as before approval -- its frozen result_summary never changes
    // just because the Statements it produced got approved.
    const run = runWith({
      accountsEvaluated: 2, statementsCreated: 2, zeroActivityAccountIds: [], errors: [],
      activityDiscovered: { entitiesWithActivity: 2, totalDonations: 13, totalGross: 215 },
      blockedEntities: [],
    });
    const component = await setup(statements, run);

    expect(component.periodDonationsCount(period)).toBe(13);
    expect(component.periodGrossAmount(period)).toBe(215);
    expect(component.periodEntitiesCount(period)).toBe(2);
  });

  it('after approval AND a later recalculation finds 0 remaining eligible activity for the now-fully-claimed entities: still reads 13 / ₪215 / 2, not 0', async () => {
    const statements = [
      stmt('stmt-a', 'entity-gedolim', 8, '207.00', 'approved'),
      stmt('stmt-b', 'entity-israels', 5, '8.00', 'approved'),
    ];
    // Mirrors the real production run 524da916: a recalculation on the same
    // period after both Statements were approved correctly finds 0 activity
    // still eligible for a *new* Statement (every donation is already
    // claimed) -- this run becoming "latest" must not zero the KPI tiles.
    const run = runWith({
      accountsEvaluated: 2, statementsCreated: 0, zeroActivityAccountIds: ['acct-entity-gedolim', 'acct-entity-israels'], errors: [],
      activityDiscovered: { entitiesWithActivity: 0, totalDonations: 0, totalGross: 0 },
      blockedEntities: [],
    });
    const component = await setup(statements, run);

    expect(component.periodDonationsCount(period)).toBe(13);
    expect(component.periodGrossAmount(period)).toBe(215);
    expect(component.periodEntitiesCount(period)).toBe(2);
  });

  it('mixed state: one entity already fully captured by an approved Statement + one entity with real activity not yet captured by any Statement -- sums both without double-counting', async () => {
    // entity-captured's 8 donations / ₪207 are already a real (approved)
    // Statement. entity-new has 5 donations / ₪8 of real eligible activity
    // that Calculation could not turn into a Statement (no billing_account
    // yet) -- it only shows up in blockedEntities, never in `statements`.
    const statements = [stmt('stmt-a', 'entity-captured', 8, '207.00', 'approved')];
    const run = runWith({
      accountsEvaluated: 1, statementsCreated: 0, zeroActivityAccountIds: [], errors: [],
      activityDiscovered: { entitiesWithActivity: 1, totalDonations: 5, totalGross: 8 },
      blockedEntities: [
        { entityId: 'entity-new', displayName: 'עמותה חדשה', donationCount: 5, grossAmount: '8.00', reason: 'no_billing_account' },
      ],
    });
    const component = await setup(statements, run);

    expect(component.periodDonationsCount(period)).toBe(13); // 8 (captured) + 5 (uncaptured)
    expect(component.periodGrossAmount(period)).toBe(215); // 207 + 8
    expect(component.periodEntitiesCount(period)).toBe(2); // entity-captured + entity-new, never double-counted
  });

  it('never double-counts an entity that appears in both a real Statement AND the latest run\'s blockedEntities (e.g. re-blocked after a later account suspension)', async () => {
    const statements = [stmt('stmt-a', 'entity-gedolim', 8, '207.00', 'approved')];
    const run = runWith({
      accountsEvaluated: 0, statementsCreated: 0, zeroActivityAccountIds: [], errors: [],
      activityDiscovered: { entitiesWithActivity: 1, totalDonations: 8, totalGross: 207 },
      // Same entity id as the existing Statement -- must not be added again.
      blockedEntities: [
        { entityId: 'entity-gedolim', displayName: 'גדולים מהחיים', donationCount: 8, grossAmount: '207.00', reason: 'account_suspended' },
      ],
    });
    const component = await setup(statements, run);

    expect(component.periodDonationsCount(period)).toBe(8);
    expect(component.periodGrossAmount(period)).toBe(207);
    expect(component.periodEntitiesCount(period)).toBe(1);
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

  // Direct regression for the Billing Collection UX truthfulness fix
  // (2026-09-02): the drawer's collection state must always be derived from
  // the backend's own readiness (never a frontend-invented default), and an
  // enabled collect action may only ever appear alongside a truthful
  // "ready" state -- see PlatformBillingOpsPageComponent#collectionState.
  // This is exactly the real-world case that was broken: an approved,
  // card-routed, total_due <= threshold Statement previously rendered
  // "מסלול מחושב: חסום" (getStatementDetail never selected routed_method)
  // while the button underneath it could still reach a real CardCom charge.
  describe('Collection readiness UX (Billing Collection truthfulness fix)', () => {
    function baseStatement(overrides: Partial<StatementDetail>): StatementDetail {
      return {
        id: 'stmt-1', billing_account_id: 'ba-1', billing_period_id: period.id, billing_run_id: 'run-1',
        gross_raised: '100.00', fee_amount: '0.00', vat_amount: '0.00', total_due: '0.28',
        status: 'approved', created_at: period.period_start, entity_id: 'entity-1', entity_name: 'ישראלס',
        component_count: 1, routed_method: 'card', latest_attempt_status: null, payment_count: 0,
        attempts: [], payments: [], componentCount: 1, account_declared_method: 'card',
        readiness: { route: 'card', ready: true, reason: null },
        ...overrides,
      } as StatementDetail;
    }

    function stubService(statement: StatementDetail) {
      return {
        listPeriods: () => of({ periods: [] }),
        listRuns: () => of({ runs: [] }),
        listStatements: () => of({ statements: [] }),
        listBlockedMasavStatements: () => of({ statements: [] }),
        listActionableMasavStatements: () => of({ statements: [] }),
        getStatement: jasmine.createSpy('getStatement').and.returnValue(of({ statement })),
        triggerCollection: jasmine.createSpy('triggerCollection').and.returnValue(of({ result: { skipped: false, outcome: 'succeeded' } })),
      };
    }

    async function openDrawer(statement: StatementDetail) {
      const service = stubService(statement);
      await TestBed.configureTestingModule({
        imports: [PlatformBillingOpsPageComponent],
        providers: [provideRouter([]), { provide: BillingOpsService, useValue: service }],
      }).compileComponents();
      const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.openStatement({ id: statement.id } as any);
      fixture.detectChanges();
      return { fixture, component, service };
    }

    it('CARD-ready: shows "מוכן לגבייה בכרטיס" + the amount + an enabled גבה button, never "חסום"', async () => {
      const statement = baseStatement({ total_due: '0.28', readiness: { route: 'card', ready: true, reason: null } });
      const { fixture } = await openDrawer(statement);

      const stateEl = fixture.debugElement.query(By.css('.bo-collection-state'));
      expect(stateEl.nativeElement.textContent).toContain('מוכן לגבייה בכרטיס');
      expect(stateEl.nativeElement.textContent).toContain('0.28');
      expect(stateEl.nativeElement.textContent).not.toContain('חסום');

      const button = fixture.debugElement.query(By.css('.bo-drawer-actions button'));
      expect(button).toBeTruthy();
      expect(button.nativeElement.disabled).toBe(false);
      expect(button.nativeElement.textContent).toContain('גבה');
    });

    it('CARD-missing-instrument: shows "דורש טיפול" + "לא הוגדר אמצעי גבייה בכרטיס", exposes NO enabled collection action', async () => {
      const statement = baseStatement({
        total_due: '7.33',
        readiness: { route: 'card', ready: false, reason: 'no_active_payment_instrument' },
      });
      const { fixture } = await openDrawer(statement);

      const stateEl = fixture.debugElement.query(By.css('.bo-collection-state'));
      expect(stateEl.nativeElement.textContent).toContain('דורש טיפול');
      expect(stateEl.nativeElement.textContent).toContain('לא הוגדר אמצעי גבייה בכרטיס');

      expect(fixture.debugElement.query(By.css('.bo-drawer-actions button'))).toBeFalsy();
    });

    it('MASAV-ready: shows "מוכן למס״ב", no generic collect action (MASAV is driven from the מס״ב tab)', async () => {
      const statement = baseStatement({
        total_due: '5000.00',
        readiness: { route: 'masav', ready: true, reason: null },
      });
      const { fixture } = await openDrawer(statement);

      const stateEl = fixture.debugElement.query(By.css('.bo-collection-state'));
      expect(stateEl.nativeElement.textContent).toContain('מוכן למס״ב');
      expect(fixture.debugElement.query(By.css('.bo-drawer-actions button'))).toBeFalsy();
    });

    it('MASAV-not-ready: shows "דורש טיפול" + "חסרים פרטי מס״ב / הרשאת מס״ב", no enabled action', async () => {
      const statement = baseStatement({
        total_due: '5000.00',
        readiness: { route: 'masav', ready: false, reason: 'masav_not_authorized' },
      });
      const { fixture } = await openDrawer(statement);

      const stateEl = fixture.debugElement.query(By.css('.bo-collection-state'));
      expect(stateEl.nativeElement.textContent).toContain('דורש טיפול');
      expect(stateEl.nativeElement.textContent).toContain('חסרים פרטי מס״ב / הרשאת מס״ב');
      expect(fixture.debugElement.query(By.css('.bo-drawer-actions button'))).toBeFalsy();
    });

    it('clicking the collect action calls triggerCollection -- wiring proof for the ready state only', async () => {
      const statement = baseStatement({ total_due: '0.28', readiness: { route: 'card', ready: true, reason: null } });
      const { fixture, service } = await openDrawer(statement);

      fixture.debugElement.query(By.css('.bo-drawer-actions button')).nativeElement.click();
      fixture.detectChanges();

      expect(service.triggerCollection).toHaveBeenCalledWith('stmt-1');
    });

    it('triggerCollection() itself refuses to call the backend when canCollect is false, even if invoked directly -- defense against a stale/bypassed disabled button', async () => {
      const statement = baseStatement({
        total_due: '7.33',
        readiness: { route: 'card', ready: false, reason: 'no_active_payment_instrument' },
      });
      const { component, service } = await openDrawer(statement);

      component.triggerCollection();

      expect(service.triggerCollection).not.toHaveBeenCalled();
    });
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
