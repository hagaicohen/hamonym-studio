import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import { PlatformBillingOpsPageComponent } from './platform-billing-ops-page.component';
import { BillingOpsService, BlockedBillingEntity, StatementListItem, StatementDetail, BillingPeriod, ActionableMasavStatement } from '../../services/billing-ops.service';
import { BillingProvisioningService, BillingReadinessEntity } from '../../services/billing-provisioning.service';
import { BillingSettingsService } from '../../services/billing-settings.service';
import { CardcomOpsService, ReconciliationFinding, HealthResponse } from '../../services/cardcom-ops.service';

// The component now also injects BillingProvisioningService (for "הגדרות
// עמותות") and CardcomOpsService (for the "דורש טיפול" section) -- neither
// is under test here, so real HttpClient + HttpClientTesting is provided
// just so those two construct cleanly; their requests are simply never
// flushed (no HttpTestingController.expectOne calls), which is harmless for
// every assertion in this file.

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

  it('opens the billing-setup drawer for the no_billing_account entity, carrying its display data along (2026-09-14h drawer redesign -- was a routerLink to /platform/billing-setup/<entityId>)', async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: stubService() }],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('periods'); // blocked-entities list lives on the periods tab, not the default 'statements' tab
    fixture.detectChanges();

    // Collapsed by default (2026-09-16 "החודש" simplification) -- expand it first.
    fixture.componentInstance.showBlockedEntities = true;
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.css('.bo-blocked-item button.ops-btn'));
    expect(buttons.length).toBe(1); // only the no_billing_account entity gets an action button

    buttons[0].nativeElement.click();
    fixture.detectChanges();

    // The drawer must receive enough context to render immediately without
    // a second lookup -- this is what lets the operator land on "הגדרות
    // חיוב — גדולים מהחיים" instead of a bare entity id, and it must stay
    // on this exact tab/list behind the drawer (no navigation away).
    const component = fixture.componentInstance;
    expect(component.billingSetupEntityId).toBe('entity-gedolim-mehachaim');
    expect(component.billingSetupEntityName).toBe('גדולים מהחיים');
    expect(component.billingSetupDonationCount).toBe(8);

    const drawer = fixture.debugElement.query(By.css('app-billing-entity-setup'));
    expect(drawer).toBeTruthy();
  });

  it('does not offer a setup link for an account_suspended entity -- that path stays a manual note, unchanged', async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: stubService() }],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('periods'); // blocked-entities list lives on the periods tab, not the default 'statements' tab
    fixture.detectChanges();

    // Collapsed by default (2026-09-16 "החודש" simplification) -- expand it first.
    fixture.componentInstance.showBlockedEntities = true;
    fixture.detectChanges();

    const manualNotes = fixture.debugElement.queryAll(By.css('.bo-blocked-manual-note'));
    expect(manualNotes.length).toBe(1);
    expect(manualNotes[0].nativeElement.textContent).toContain('טיפול ידני');

    // Only the no_billing_account entity gets an actionable button at all --
    // the suspended one has no button to click, buttons.length already
    // proved that in the previous test; this confirms it here too.
    const buttons = fixture.debugElement.queryAll(By.css('.bo-blocked-item button.ops-btn'));
    expect(buttons.length).toBe(1);
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
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
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
      next_action: '—',
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
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
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
      next_action: '—',
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
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    // The bulk-approval table this whole suite exercises lives on the
    // "periods" tab -- 'statements' became the default tab in a later,
    // separate change (Billing v1 simplicity decision, 2026-09-10) that
    // predates this fix and was never reflected here.
    fixture.componentInstance.setTab('periods');
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
        listPeriods: () => of({ periods: [period] }),
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
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
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

    it('CARD-missing-instrument: shows "דורש טיפול" + "לא הוגדר אמצעי גבייה בכרטיס", exposes a billing-setup link but no collection action (2026-09-16 drawer simplification)', async () => {
      const statement = baseStatement({
        total_due: '7.33',
        readiness: { route: 'card', ready: false, reason: 'no_active_payment_instrument' },
      });
      const { fixture, component } = await openDrawer(statement);

      const stateEl = fixture.debugElement.query(By.css('.bo-collection-state'));
      expect(stateEl.nativeElement.textContent).toContain('דורש טיפול');
      expect(stateEl.nativeElement.textContent).toContain('לא הוגדר אמצעי גבייה בכרטיס');

      const button = fixture.debugElement.query(By.css('.bo-drawer-actions button'));
      expect(button.nativeElement.textContent).toContain('השלם הגדרות חיוב');

      button.nativeElement.click();
      fixture.detectChanges();
      // Reuses the exact same destination "מה עושים עכשיו" already uses
      // from the table -- no new business rule, just this drawer wired to it.
      expect(component.billingSetupEntityId).toBe('entity-1');
      expect(component.selectedStatement).toBeNull(); // closes itself, context no longer applies
    });

    it('MASAV-ready: shows "מוכן למס״ב" + a "עבור למס״ב" navigation action, no collection action (MASAV is driven from the מס״ב tab)', async () => {
      const statement = baseStatement({
        total_due: '5000.00',
        readiness: { route: 'masav', ready: true, reason: null },
      });
      const { fixture, component } = await openDrawer(statement);

      const stateEl = fixture.debugElement.query(By.css('.bo-collection-state'));
      expect(stateEl.nativeElement.textContent).toContain('מוכן למס״ב');

      const button = fixture.debugElement.query(By.css('.bo-drawer-actions button'));
      expect(button.nativeElement.textContent).toContain('עבור למס״ב');

      button.nativeElement.click();
      fixture.detectChanges();
      expect(component.tab).toBe('masav');
      expect(component.selectedStatement).toBeNull();
    });

    it('MASAV-not-ready: shows "דורש טיפול" + "חסרים פרטי מס״ב / הרשאת מס״ב" + a billing-setup link, no collection action', async () => {
      const statement = baseStatement({
        total_due: '5000.00',
        readiness: { route: 'masav', ready: false, reason: 'masav_not_authorized' },
      });
      const { fixture } = await openDrawer(statement);

      const stateEl = fixture.debugElement.query(By.css('.bo-collection-state'));
      expect(stateEl.nativeElement.textContent).toContain('דורש טיפול');
      expect(stateEl.nativeElement.textContent).toContain('חסרים פרטי מס״ב / הרשאת מס״ב');

      const button = fixture.debugElement.query(By.css('.bo-drawer-actions button'));
      expect(button.nativeElement.textContent).toContain('השלם הגדרות חיוב');
    });

    it('CARD-ready with a failed latest attempt: the collect button reads "נסה גבייה שוב", not the generic "גבה" label', async () => {
      const statement = baseStatement({
        total_due: '0.28',
        readiness: { route: 'card', ready: true, reason: null },
        latest_attempt_status: 'declined',
      });
      const { fixture } = await openDrawer(statement);

      const button = fixture.debugElement.query(By.css('.bo-drawer-actions button'));
      expect(button.nativeElement.textContent).toContain('נסה גבייה שוב');
    });

    it('header + summary tell the whole story once, using readiness.route (never account_declared_method) for the collection method', async () => {
      const statement = baseStatement({
        entity_name: 'גדולים מהחיים',
        gross_raised: '100.00', fee_amount: '2.50', vat_amount: '0.43', total_due: '2.93',
        componentCount: 3,
        status: 'draft',
        account_declared_method: 'masav', // deliberately disagrees with readiness -- must NOT be shown
        readiness: { route: 'card', ready: true, reason: null },
      });
      const { fixture } = await openDrawer(statement);

      const header = fixture.debugElement.query(By.css('.bo-drawer-header h2'));
      expect(header.nativeElement.textContent).toContain('גדולים מהחיים');

      const summary = fixture.debugElement.query(By.css('.bo-statement-summary'));
      const text = summary.nativeElement.textContent;
      expect(text).toContain('3 תרומות בסך ₪100.00');
      expect(text).toContain('עמלת פלטפורמה ₪2.50 + מע״מ ₪0.43 = ₪2.93 לחיוב');
      expect(text).toContain('אמצעי גבייה: כרטיס אשראי'); // from readiness.route, not the disagreeing account_declared_method
      expect(text).not.toContain('מס״ב');
      expect(text).toContain('מצב: ממתין לאישור');
    });

    it('draft: "אשר חיוב" is the primary action; "בטל את טיוטת החיוב" is present but visually secondary, not a second equal-weight button', async () => {
      const statement = baseStatement({ status: 'draft' });
      const { fixture, service } = await openDrawer(statement);
      (service as any).abandonStatement = jasmine.createSpy('abandonStatement').and.returnValue(of({}));

      const primary = fixture.debugElement.query(By.css('.bo-drawer-actions button'));
      expect(primary.nativeElement.textContent).toContain('אשר חיוב');

      const secondary = fixture.debugElement.query(By.css('.bo-drawer-secondary-action'));
      expect(secondary.nativeElement.textContent).toContain('בטל את טיוטת החיוב');
      // Not inside .bo-drawer-actions (the primary-action button row) -- de-emphasized, own element.
      expect(fixture.debugElement.query(By.css('.bo-drawer-actions .bo-drawer-secondary-action'))).toBeFalsy();

      secondary.nativeElement.click();
      fixture.detectChanges();
      expect((service as any).abandonStatement).toHaveBeenCalledWith('stmt-1'); // still wired, unchanged semantics
    });

    it('paid: shows "שולם" as a done state, no collection action', async () => {
      const statement = baseStatement({ status: 'paid' });
      const { fixture } = await openDrawer(statement);

      const done = fixture.debugElement.query(By.css('.bo-drawer-next-action-done'));
      expect(done.nativeElement.textContent).toContain('שולם');
      expect(fixture.debugElement.query(By.css('.bo-drawer-actions'))).toBeFalsy();
    });

    it('history section is omitted entirely when there are no attempts and no payments', async () => {
      const statement = baseStatement({ attempts: [], payments: [] });
      const { fixture } = await openDrawer(statement);

      expect(fixture.debugElement.query(By.css('.bo-drawer-history'))).toBeFalsy();
      expect(fixture.nativeElement.textContent).not.toContain('אין עדיין ניסיונות גבייה');
      expect(fixture.nativeElement.textContent).not.toContain('אין עדיין תשלומים');
    });

    it('history section appears once a collection attempt exists, even with no payments yet', async () => {
      const statement = baseStatement({
        attempts: [{
          id: 'att-1', statement_id: 'stmt-1', collection_method: 'card', attempt_number: 1,
          status: 'declined', provider: 'cardcom', provider_reference: null, provider_raw_status: null,
          failure_reason: 'card declined', requested_amount: '0.28', initiated_at: '2026-09-10T00:00:00.000Z', resolved_at: null,
        }],
        payments: [],
      });
      const { fixture } = await openDrawer(statement);

      const history = fixture.debugElement.query(By.css('.bo-drawer-history'));
      expect(history).toBeTruthy();
      expect(history.nativeElement.textContent).toContain('היסטוריית גבייה ותשלומים');
      expect(history.nativeElement.textContent).toContain('ניסיונות גבייה');
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
    (service as any).getStatement = jasmine.createSpy().and.returnValue(of({
      statement: { ...draftA, attempts: [], payments: [], componentCount: 2, account_declared_method: 'card', readiness: { route: 'card', ready: true, reason: null } },
    }));

    const detailButtons = fixture.debugElement.queryAll(By.css('.bo-table tbody button'));
    detailButtons[0].nativeElement.click();
    fixture.detectChanges();

    expect((service as any).getStatement).toHaveBeenCalledWith('stmt-a');
  });
});

// Regression coverage for making "מה עושים עכשיו" actionable on "החודש"
// (2026-09-14m): a Statement whose next_action is 'חסר כרטיס אשראי' (or
// 'ממתין לאישור מס״ב') should let the operator act on it directly -- both
// conditions are resolved in the same existing billing-setup drawer
// (CARD readiness + MASAV authorization both live there), so clicking
// opens it for that exact entity without navigating away from "החודש".
// Any other next_action (already-fine states, or ones with no existing
// destination) must stay a plain, non-clickable label.
describe('PlatformBillingOpsPageComponent - clickable "מה עושים עכשיו" (החודש)', () => {
  const period = {
    id: 'period-aug-2026',
    period_start: '2026-08-01T00:00:00.000Z',
    period_end: '2026-09-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    retired: false,
    run_count: 1,
  };
  const run = {
    id: 'run-1', billing_period_id: period.id, mode: 'production' as const,
    as_of: period.period_start, status: 'completed',
    result_summary: {
      accountsEvaluated: 2, statementsCreated: 2, zeroActivityAccountIds: [], errors: [],
      activityDiscovered: { entitiesWithActivity: 2, totalDonations: 2, totalGross: 100 },
      blockedEntities: [],
    },
    created_at: period.period_start, completed_at: period.period_start,
  };

  function stmt(id: string, entityId: string, entityName: string, nextAction: string): StatementListItem {
    return {
      id, billing_account_id: `acct-${entityId}`, billing_period_id: period.id, billing_run_id: run.id,
      gross_raised: '50.00', fee_amount: '1.50', vat_amount: '0.27', total_due: '1.77',
      status: 'approved', created_at: period.period_start,
      entity_id: entityId, entity_name: entityName, component_count: 1,
      routed_method: 'card', latest_attempt_status: null, payment_count: 0,
      next_action: nextAction,
    };
  }

  async function setup(statements: StatementListItem[]) {
    const service = {
      listPeriods: () => of({ periods: [period] }),
      listRuns: () => of({ runs: [run] }),
      listStatements: () => of({ statements }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('periods');
    fixture.detectChanges();
    return { fixture };
  }

  it('גדולים מהחיים → "חסר כרטיס אשראי" → click → the billing-setup drawer opens for גדולים מהחיים, still on "החודש"', async () => {
    const { fixture } = await setup([
      stmt('stmt-1', 'entity-gedolim-mehachaim', 'גדולים מהחיים', 'חסר כרטיס אשראי'),
    ]);

    const btn = fixture.debugElement.query(By.css('.bo-next-action-clickable'));
    expect(btn).toBeTruthy();
    expect(btn.nativeElement.textContent).toContain('חסר כרטיס אשראי');

    btn.nativeElement.click();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.tab).toBe('periods'); // stayed on "החודש", drawer is an overlay
    expect(component.billingSetupEntityId).toBe('entity-gedolim-mehachaim');
    expect(component.billingSetupEntityName).toBe('גדולים מהחיים');
    expect(fixture.debugElement.query(By.css('app-billing-entity-setup'))).toBeTruthy();
  });

  it('"ממתין לאישור מס״ב" is also actionable, opening the same drawer for its entity', async () => {
    const { fixture } = await setup([
      stmt('stmt-2', 'entity-other', 'עמותה אחרת', 'ממתין לאישור מס״ב'),
    ]);

    const btn = fixture.debugElement.query(By.css('.bo-next-action-clickable'));
    btn.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.billingSetupEntityId).toBe('entity-other');
  });

  it('a non-actionable next_action (e.g. "מוכן לגבייה") stays a plain label, not a button', async () => {
    const { fixture } = await setup([
      stmt('stmt-3', 'entity-ready', 'עמותה מוכנה', 'מוכן לגבייה'),
    ]);

    expect(fixture.debugElement.query(By.css('.bo-next-action-clickable'))).toBeFalsy();
    const label = fixture.debugElement.query(By.css('.bo-next-action'));
    expect(label.nativeElement.tagName.toLowerCase()).toBe('span');
    expect(label.nativeElement.textContent).toContain('מוכן לגבייה');
  });
});

// Regression coverage for "מצב" as an operational collection state rather
// than the raw Statement lifecycle status (2026-09-14n, "החודש" only): an
// approved-but-not-yet-collected Statement must never read as "מאושר"
// (sounds done/successful to an operator) -- it should read "ממתין לגבייה".
// Derived from status/routed_method/latest_attempt_status, the exact same
// fields nextActionLabel itself already uses server-side -- no new backend
// state. Also verifies the CARD-only failure gating: a MASAV Statement
// legitimately waiting for export must never show as "הגבייה נכשלה".
describe('PlatformBillingOpsPageComponent - "מצב" as operational collection state (החודש)', () => {
  const period = {
    id: 'period-aug-2026',
    period_start: '2026-08-01T00:00:00.000Z',
    period_end: '2026-09-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    retired: false,
    run_count: 1,
  };
  const run = {
    id: 'run-1', billing_period_id: period.id, mode: 'production' as const,
    as_of: period.period_start, status: 'completed',
    result_summary: {
      accountsEvaluated: 1, statementsCreated: 1, zeroActivityAccountIds: [], errors: [],
      activityDiscovered: { entitiesWithActivity: 1, totalDonations: 1, totalGross: 50 },
      blockedEntities: [],
    },
    created_at: period.period_start, completed_at: period.period_start,
  };

  function stmt(overrides: Partial<StatementListItem>): StatementListItem {
    return {
      id: 'stmt-1', billing_account_id: 'acct-1', billing_period_id: period.id, billing_run_id: run.id,
      gross_raised: '50.00', fee_amount: '1.50', vat_amount: '0.27', total_due: '1.77',
      status: 'approved', created_at: period.period_start,
      entity_id: 'entity-gedolim-mehachaim', entity_name: 'גדולים מהחיים', component_count: 1,
      routed_method: 'card', latest_attempt_status: null, payment_count: 0,
      next_action: 'חסר כרטיס אשראי',
      ...overrides,
    };
  }

  async function setup(statement: StatementListItem) {
    const service = {
      listPeriods: () => of({ periods: [period] }),
      listRuns: () => of({ runs: [run] }),
      listStatements: () => of({ statements: [statement] }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('periods');
    fixture.detectChanges();
    // Row order is אמצעי גבייה (routed-method badge) then מצב (status
    // badge) -- both use .bo-badge, so pick the second one specifically.
    const badges = fixture.debugElement.queryAll(By.css('.bo-table tbody .bo-badge'));
    const cell = badges[1];
    return { fixture, cell };
  }

  it('approved, CARD route, no failed attempt -> "ממתין לגבייה", not "מאושר" (the exact case reported: גדולים מהחיים)', async () => {
    const { cell } = await setup(stmt({ status: 'approved', routed_method: 'card', latest_attempt_status: null }));
    expect(cell.nativeElement.textContent.trim()).toBe('ממתין לגבייה');
    expect(cell.nativeElement.classList).toContain('bo-badge-open');
  });

  it('open, CARD route, latest attempt declined -> "הגבייה נכשלה"', async () => {
    const { cell } = await setup(stmt({ status: 'open', routed_method: 'card', latest_attempt_status: 'declined' }));
    expect(cell.nativeElement.textContent.trim()).toBe('הגבייה נכשלה');
    expect(cell.nativeElement.classList).toContain('bo-badge-collection-failed');
  });

  it('approved, MASAV route, legitimately waiting for export -> "ממתין לגבייה", never "הגבייה נכשלה" even with unrelated attempt history', async () => {
    // latest_attempt_status set to a "failed" value on purpose -- proves the
    // CARD-only gate, not just that masav statements happen to have none.
    const { cell } = await setup(stmt({ status: 'approved', routed_method: 'masav', latest_attempt_status: 'declined' }));
    expect(cell.nativeElement.textContent.trim()).toBe('ממתין לגבייה');
    expect(cell.nativeElement.classList).toContain('bo-badge-open');
  });

  it('draft -> "ממתין לאישור"', async () => {
    const { cell } = await setup(stmt({ status: 'draft', latest_attempt_status: null }));
    expect(cell.nativeElement.textContent.trim()).toBe('ממתין לאישור');
  });

  it('paid -> "שולם"', async () => {
    const { cell } = await setup(stmt({ status: 'paid', latest_attempt_status: null }));
    expect(cell.nativeElement.textContent.trim()).toBe('שולם');
  });
});

// Regression coverage for the VAT globalization pass (2026-09-14i, editor
// relocated 2026-09-14j to Platform Admin -> הגדרות כלליות -> חיוב ומיסוי):
// "הגדרות עמותות" must show the current system VAT rate read-only in the
// table (real information, not a stale per-account value) but must NOT
// offer any way to change it -- see platform-general-settings-page.
// component.spec.ts for the paired proof that it CAN be changed there. The
// per-entity readiness table must also never offer a VAT input of its own
// -- both the "no billing_account yet" and "already provisioned" rows
// route through the same billing-setup drawer.
// Regression coverage for unifying "כל החיובים" with "החודש"'s already-
// approved operator semantics (2026-09-14o): the exact same Statement must
// never show "מאושר" on one tab and "ממתין לגבייה" on the other, and the
// same clickable "מה עושים עכשיו" action must be reachable here too --
// reusing the identical component methods (operationalStateLabel/
// operationalStateBadgeClass/isActionableNextAction/onNextActionClick),
// not a second implementation.
describe('PlatformBillingOpsPageComponent - "כל החיובים" consistency with "החודש"', () => {
  function stmt(overrides: Partial<StatementListItem>): StatementListItem {
    return {
      id: 'stmt-1', billing_account_id: 'acct-1', billing_period_id: 'period-1', billing_run_id: 'run-1',
      gross_raised: '50.00', fee_amount: '1.50', vat_amount: '0.27', total_due: '1.77',
      status: 'approved', created_at: '2026-08-05T00:00:00.000Z',
      entity_id: 'entity-gedolim-mehachaim', entity_name: 'גדולים מהחיים', component_count: 1,
      routed_method: 'card', latest_attempt_status: null, payment_count: 0,
      next_action: 'חסר כרטיס אשראי',
      ...overrides,
    };
  }

  async function setup(statement: StatementListItem) {
    const getStatementSpy = jasmine.createSpy('getStatement').and.returnValue(of({ statement: { ...statement, attempts: [], payments: [], account_declared_method: 'card' } }));
    const service = {
      listPeriods: () => of({ periods: [] }),
      listRuns: () => of({ runs: [] }),
      listStatements: () => of({ statements: [statement] }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
      getStatement: getStatementSpy,
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('statements');
    fixture.detectChanges();
    return { fixture, getStatementSpy };
  }

  it('גדולים מהחיים, approved + missing card instrument: "מצב" reads "ממתין לגבייה" here too (not "מאושר"), matching "החודש"', async () => {
    const { fixture } = await setup(stmt({ status: 'approved', routed_method: 'card', latest_attempt_status: null }));

    const badges = fixture.debugElement.queryAll(By.css('.bo-table tbody .bo-badge'));
    const statusBadge = badges[1]; // route badge is first, status badge second -- same row layout as החודש
    expect(statusBadge.nativeElement.textContent.trim()).toBe('ממתין לגבייה');
    expect(statusBadge.nativeElement.classList).toContain('bo-badge-open');
  });

  it('"חסר כרטיס אשראי" is clickable here too, opens the billing-setup drawer, and does not also trigger the row\'s own "open statement detail" click', async () => {
    const { fixture, getStatementSpy } = await setup(stmt({ next_action: 'חסר כרטיס אשראי' }));

    const btn = fixture.debugElement.query(By.css('.bo-next-action-clickable'));
    expect(btn).toBeTruthy();
    expect(btn.nativeElement.textContent).toContain('חסר כרטיס אשראי');

    btn.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.billingSetupEntityId).toBe('entity-gedolim-mehachaim');
    expect(getStatementSpy).not.toHaveBeenCalled(); // the row's own click handler must not also fire
  });

  it('a paid Statement keeps the existing "—" dedup in "מה עושים עכשיו" (unchanged) and shows "שולם" in "מצב"', async () => {
    const { fixture } = await setup(stmt({ status: 'paid', next_action: 'שולם', latest_attempt_status: null }));

    expect(fixture.debugElement.query(By.css('.bo-next-action-clickable'))).toBeFalsy();
    const nextActionCell = fixture.debugElement.query(By.css('.bo-next-action'));
    expect(nextActionCell.nativeElement.textContent.trim()).toBe('—');

    const badges = fixture.debugElement.queryAll(By.css('.bo-table tbody .bo-badge'));
    expect(badges[1].nativeElement.textContent.trim()).toBe('שולם');
  });
});

// Regression coverage for separating "MASAV configured but not yet
// authorized" (neutral configuration fact) from "MASAV authorization is
// an active blocker right now" (2026-09-14p, הגדרות עמותות). The exact
// reported case: גדולים מהחיים has bank details configured, not yet
// authorized, but its one live Statement (₪7.33) already routes to CARD
// -- MASAV isn't blocking anything today, so the cell must read "הוגדר ·
// טרם אושר" with no ⚠, even though "מוכנות לחיוב" already (correctly)
// says ready. hasEntityMasavBlocker is reused as-is, not reimplemented.
describe('PlatformBillingOpsPageComponent - מס״ב configuration vs. active blocker (הגדרות עמותות)', () => {
  const entity: BillingReadinessEntity = {
    id: 'entity-gedolim-mehachaim', display_name: 'גדולים מהחיים', billing_account_id: 'ba-1',
    fee_rate: '0.03', vat_rate: '0.18', enforcement_status: 'active', preferred_collection_method: 'card',
    masav_authorized: false, masav_configured: true, paid_donation_count: 8, paid_gross_total: '207.00',
  };

  async function setup(statements: StatementListItem[]) {
    const provisioningStub = {
      getReadiness: () => of({ entities: [entity] }),
      getByEntityId: () => of({ account: null }),
      getUnprovisioned: () => of({ entities: [] }),
    };
    const opsStub = {
      listPeriods: () => of({ periods: [] }),
      listRuns: () => of({ runs: [] }),
      listStatements: () => of({ statements }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
      getMasavConfig: () => of({ config: null }),
    };
    const settingsStub = { get: () => of({ setting: { vat_rate: '0.18', updated_at: '', updated_by: null } }) };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: BillingOpsService, useValue: opsStub },
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingSettingsService, useValue: settingsStub },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('entities');
    fixture.detectChanges();
    return { fixture };
  }

  it('configured, not authorized, but its live Statement already routes to card (₪7.33, not blocked) -> "הוגדר · טרם אושר", no ⚠ -- and readiness still says מוכנה לחיוב', async () => {
    const { fixture } = await setup([{
      id: 'stmt-1', billing_account_id: 'ba-1', billing_period_id: 'p-1', billing_run_id: 'r-1',
      gross_raised: '244.33', fee_amount: '7.33', vat_amount: '0.00', total_due: '7.33',
      status: 'approved', created_at: '2026-08-01T00:00:00.000Z',
      entity_id: 'entity-gedolim-mehachaim', entity_name: 'גדולים מהחיים', component_count: 1,
      routed_method: 'card', latest_attempt_status: null, payment_count: 0, next_action: 'מוכן לגבייה',
    }]);

    const state = fixture.componentInstance.masavDisplayState(entity);
    expect(state.label).toBe('הוגדר · טרם אושר');
    expect(state.icon).toBe('');
    expect(fixture.nativeElement.textContent).not.toContain('ממתין לאישור מס״ב');

    expect(fixture.componentInstance.entityReadiness(entity).ready).toBe(true);
    expect(fixture.componentInstance.entityReadiness(entity).label).toBe('מוכנה לחיוב');
  });

  it('configured, not authorized, and a live Statement genuinely routed to masav/blocked for lack of authorization -> "⚠ ממתין לאישור" is preserved', async () => {
    const { fixture } = await setup([{
      id: 'stmt-2', billing_account_id: 'ba-1', billing_period_id: 'p-1', billing_run_id: 'r-1',
      gross_raised: '150000.00', fee_amount: '4500.00', vat_amount: '810.00', total_due: '5310.00',
      status: 'approved', created_at: '2026-08-01T00:00:00.000Z',
      entity_id: 'entity-gedolim-mehachaim', entity_name: 'גדולים מהחיים', component_count: 1,
      routed_method: 'blocked', latest_attempt_status: null, payment_count: 0, next_action: 'ממתין לאישור מס״ב',
    }]);

    const state = fixture.componentInstance.masavDisplayState(entity);
    expect(state.label).toBe('ממתין לאישור');
    expect(state.icon).toBe('⚠');

    expect(fixture.componentInstance.entityReadiness(entity).ready).toBe(false);
  });
});

describe('PlatformBillingOpsPageComponent - system-wide VAT setting (הגדרות עמותות)', () => {
  const readinessEntities: BillingReadinessEntity[] = [
    {
      id: 'entity-a', display_name: 'עמותה עם חשבון חיוב', billing_account_id: 'ba-1',
      fee_rate: '0.03', vat_rate: '0.18', enforcement_status: 'active', preferred_collection_method: 'card',
      masav_authorized: null, masav_configured: false, paid_donation_count: 5, paid_gross_total: '100.00',
    },
    {
      id: 'entity-b', display_name: 'עמותה בלי חשבון חיוב', billing_account_id: null,
      fee_rate: null, vat_rate: null, enforcement_status: null, preferred_collection_method: null,
      masav_authorized: null, masav_configured: false, paid_donation_count: 2, paid_gross_total: '40.00',
    },
  ];

  function opsStub() {
    return {
      listPeriods: () => of({ periods: [] }),
      listRuns: () => of({ runs: [] }),
      listStatements: () => of({ statements: [] }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
      getMasavConfig: () => of({ config: null }), // used by BillingEntitySetupComponent once the drawer opens
    };
  }

  async function setup(vatRate = '0.18') {
    // Also used by BillingEntitySetupComponent once the drawer opens (same
    // injected service) -- getByEntityId/getUnprovisioned must be stubbed
    // too, not just getReadiness.
    const provisioningStub = {
      getReadiness: () => of({ entities: readinessEntities }),
      getByEntityId: () => of({ account: null }),
      getUnprovisioned: () => of({ entities: [] }),
    };
    const settingsStub = {
      get: jasmine.createSpy('get').and.returnValue(of({ setting: { vat_rate: vatRate, updated_at: '', updated_by: null } })),
      update: jasmine.createSpy('update'), // must never be called from this page anymore -- see the test below
    };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: BillingOpsService, useValue: opsStub() },
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingSettingsService, useValue: settingsStub },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('entities');
    fixture.detectChanges();
    return { fixture, settingsStub };
  }

  it('shows the current system VAT rate as read-only information in the table, with no editor/save action anywhere on this tab (2026-09-14j: moved to הגדרות כלליות)', async () => {
    const { fixture, settingsStub } = await setup('0.18');

    // The table cell shows the real current rate, not a placeholder.
    const vatCells = fixture.debugElement.queryAll(By.css('.bo-table tbody td'));
    const cellText = vatCells.map((c) => c.nativeElement.textContent).join(' | ');
    expect(cellText).toContain('18%');

    // No VAT card, no "שינוי" control, no save action -- this page can no
    // longer write the setting at all.
    expect(fixture.debugElement.query(By.css('.gs-vat-display'))).toBeFalsy();
    expect(fixture.nativeElement.textContent).not.toContain('שיעור מע״מ נוכחי');
    expect(settingsStub.update).not.toHaveBeenCalled();
  });

  it('the readiness table never renders a VAT input -- both provisioned and unprovisioned rows only get a button opening the shared billing-setup drawer', async () => {
    const { fixture } = await setup();

    const vatInputs = fixture.debugElement.queryAll(By.css('.bo-table input'));
    expect(vatInputs.length).toBe(0);

    const rowButtons = fixture.debugElement.queryAll(By.css('.bo-table tbody button.ops-btn'));
    expect(rowButtons.length).toBe(2); // one per entity, provisioned or not

    rowButtons[1].nativeElement.click(); // entity-b: no billing_account_id yet
    fixture.detectChanges();

    expect(fixture.componentInstance.billingSetupEntityId).toBe('entity-b');
    expect(fixture.debugElement.query(By.css('app-billing-entity-setup'))).toBeTruthy();
  });
});

// Column sorting + visibility (2026-09-16), rolled out only to the 3
// substantial one-row-per-entity/statement tables on this page (per
// explicit "meaningful tables only" product guidance) -- reuses
// app-column-picker and the same toggle-direction-on-repeat-click
// convention already proven on platform-organizations-page and the
// donations browser. All 3 tables sort a fully-loaded local array
// client-side; no backend call is involved in sorting here.
describe('PlatformBillingOpsPageComponent - column sorting + visibility', () => {
  function stmt(overrides: Partial<StatementListItem>): StatementListItem {
    return {
      id: 'stmt-1', billing_account_id: 'acct-1', billing_period_id: 'period-1', billing_run_id: 'run-1',
      gross_raised: '50.00', fee_amount: '1.50', vat_amount: '0.27', total_due: '1.77',
      status: 'approved', created_at: '2026-08-05T00:00:00.000Z',
      entity_id: 'entity-a', entity_name: 'עמותת א', component_count: 1,
      routed_method: 'card', latest_attempt_status: null, payment_count: 0,
      next_action: 'מוכן לגבייה',
      ...overrides,
    };
  }

  const period: BillingPeriod = { id: 'period-1', period_start: '2026-08-01T00:00:00.000Z', period_end: '2026-08-31T23:59:59.999Z', created_at: '2026-08-01T00:00:00.000Z', retired: false, run_count: 1 };

  // "החודש" only renders its statements table once a calculation run
  // exists for the period (runsForPeriod().length > 0) -- otherwise it
  // shows "טרם בוצע חישוב חיובים לחודש זה." regardless of statements data.
  const run = {
    id: 'run-1', billing_period_id: 'period-1', mode: 'production' as const, as_of: '2026-08-05T00:00:00.000Z',
    status: 'completed', result_summary: { accountsEvaluated: 1, statementsCreated: 1, zeroActivityAccountIds: [], errors: [] },
    created_at: '2026-08-05T00:00:00.000Z', completed_at: '2026-08-05T00:00:01.000Z',
  };

  async function setup(statements: StatementListItem[]) {
    const service = {
      listPeriods: () => of({ periods: [period] }),
      listRuns: () => of({ runs: [run] }),
      listStatements: () => of({ statements }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('"החודש": clicking a sortable header reorders rows by that column; clicking again reverses', async () => {
    const fixture = await setup([
      stmt({ id: 's-low', entity_id: 'e-low', entity_name: 'עמותה נמוכה', total_due: '10.00' }),
      stmt({ id: 's-high', entity_id: 'e-high', entity_name: 'עמותה גבוהה', total_due: '90.00' }),
    ]);
    fixture.componentInstance.setTab('periods');
    fixture.detectChanges();

    const dueHeader = fixture.debugElement.queryAll(By.css('.bo-table th.sortable')).find((h) => h.nativeElement.textContent.includes('לחיוב'))!;
    dueHeader.nativeElement.click();
    fixture.detectChanges();

    let names = fixture.debugElement.queryAll(By.css('.bo-table tbody tr td:nth-child(2)')).map((td) => td.nativeElement.textContent.trim());
    expect(names).toEqual(['עמותה נמוכה', 'עמותה גבוהה']); // ascending: 10 before 90

    dueHeader.nativeElement.click();
    fixture.detectChanges();
    names = fixture.debugElement.queryAll(By.css('.bo-table tbody tr td:nth-child(2)')).map((td) => td.nativeElement.textContent.trim());
    expect(names).toEqual(['עמותה גבוהה', 'עמותה נמוכה']); // descending
  });

  it('"החודש": column picker hides a column from header, body and the totals row together', async () => {
    const fixture = await setup([stmt({})]);
    fixture.componentInstance.setTab('periods');
    fixture.detectChanges();

    let headerText = fixture.debugElement.query(By.css('.bo-table thead')).nativeElement.textContent;
    expect(headerText).toContain('מע״מ');

    fixture.componentInstance.onVisibleMonthColumnsChange(
      new Set(fixture.componentInstance.monthTableColumns.map((c) => c.key).filter((k) => k !== 'vat')),
    );
    fixture.detectChanges();

    headerText = fixture.debugElement.query(By.css('.bo-table thead')).nativeElement.textContent;
    expect(headerText).not.toContain('מע״מ');
    // עמותה is the always-visible anchor column, never hidden by the picker.
    expect(headerText).toContain('עמותה');
  });

  it('"כל החיובים": clicking a sortable header reorders rows by that column', async () => {
    const fixture = await setup([
      stmt({ id: 's-low', entity_id: 'e-low', entity_name: 'עמותה נמוכה', total_due: '10.00' }),
      stmt({ id: 's-high', entity_id: 'e-high', entity_name: 'עמותה גבוהה', total_due: '90.00' }),
    ]);
    fixture.componentInstance.setTab('statements');
    fixture.detectChanges();

    const dueHeader = fixture.debugElement.queryAll(By.css('.bo-table th.sortable')).find((h) => h.nativeElement.textContent.includes('סכום לחיוב'))!;
    dueHeader.nativeElement.click();
    fixture.detectChanges();

    const names = fixture.debugElement.queryAll(By.css('.bo-table tbody tr td:first-child')).map((td) => td.nativeElement.textContent.trim());
    expect(names).toEqual(['עמותה נמוכה', 'עמותה גבוהה']); // ascending
  });

  it('"הגדרות עמותות": clicking a sortable header reorders rows by עמלה; column picker hides a column', async () => {
    const entities: BillingReadinessEntity[] = [
      { id: 'e-hi', display_name: 'עמותה עמלה גבוהה', billing_account_id: 'ba-1', fee_rate: '0.05', vat_rate: '0.18', enforcement_status: 'active', preferred_collection_method: 'card', masav_authorized: true, masav_configured: true, paid_donation_count: 1, paid_gross_total: '10.00' },
      { id: 'e-lo', display_name: 'עמותה עמלה נמוכה', billing_account_id: 'ba-2', fee_rate: '0.02', vat_rate: '0.18', enforcement_status: 'active', preferred_collection_method: 'card', masav_authorized: true, masav_configured: true, paid_donation_count: 1, paid_gross_total: '10.00' },
    ];
    const provisioningStub = {
      getReadiness: () => of({ entities }),
      getByEntityId: () => of({ account: null }),
      getUnprovisioned: () => of({ entities: [] }),
    };
    const opsStub = {
      listPeriods: () => of({ periods: [] }),
      listRuns: () => of({ runs: [] }),
      listStatements: () => of({ statements: [] }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
      getMasavConfig: () => of({ config: null }),
    };
    const settingsStub = { get: () => of({ setting: { vat_rate: '0.18', updated_at: '', updated_by: null } }) };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: BillingOpsService, useValue: opsStub },
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingSettingsService, useValue: settingsStub },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('entities');
    fixture.detectChanges();

    const feeHeader = fixture.debugElement.queryAll(By.css('.bo-table th.sortable')).find((h) => h.nativeElement.textContent.includes('עמלה'))!;
    feeHeader.nativeElement.click();
    fixture.detectChanges();

    let names = fixture.debugElement.queryAll(By.css('.bo-table tbody tr td:first-child')).map((td) => td.nativeElement.textContent.trim());
    expect(names).toEqual(['עמותה עמלה נמוכה', 'עמותה עמלה גבוהה']); // ascending: 2% before 5%

    fixture.componentInstance.onVisibleReadinessColumnsChange(
      new Set(fixture.componentInstance.readinessColumns.map((c) => c.key).filter((k) => k !== 'card')),
    );
    fixture.detectChanges();
    const headerText = fixture.debugElement.query(By.css('.bo-table thead')).nativeElement.textContent;
    expect(headerText).not.toContain('כרטיס אשראי');
  });
});

// 2026-09-16 loading-state audit/fix: a true first load (nothing on
// screen yet) may show "טוען...", but stepMonth()/calculatePeriod()/
// filter changes/bulk-approve/post-billing-setup-save refetches must keep
// the existing content visible -- dimmed via the shared .refreshing class,
// never replaced.
describe('PlatformBillingOpsPageComponent - loading vs. refreshing (2026-09-16 fix)', () => {
  function stmt(overrides: Partial<StatementListItem>): StatementListItem {
    return {
      id: 'stmt-1', billing_account_id: 'acct-1', billing_period_id: 'period-1', billing_run_id: 'run-1',
      gross_raised: '50.00', fee_amount: '1.50', vat_amount: '0.27', total_due: '1.77',
      status: 'approved', created_at: '2026-08-05T00:00:00.000Z',
      entity_id: 'entity-a', entity_name: 'עמותת א', component_count: 1,
      routed_method: 'card', latest_attempt_status: null, payment_count: 0,
      next_action: 'מוכן לגבייה',
    };
  }

  const period: BillingPeriod = { id: 'period-1', period_start: '2026-08-01T00:00:00.000Z', period_end: '2026-08-31T23:59:59.999Z', created_at: '2026-08-01T00:00:00.000Z', retired: false, run_count: 1 };
  const run = {
    id: 'run-1', billing_period_id: 'period-1', mode: 'production' as const, as_of: '2026-08-05T00:00:00.000Z',
    status: 'completed', result_summary: { accountsEvaluated: 1, statementsCreated: 1, zeroActivityAccountIds: [], errors: [] },
    created_at: '2026-08-05T00:00:00.000Z', completed_at: '2026-08-05T00:00:01.000Z',
  };

  it('"החודש"/"כל החיובים": calculatePeriod() (re-triggers both loadPeriods and loadStatements) dims the existing content instead of blanking it', async () => {
    const listPeriods$ = new Subject<any>();
    const listStatements$ = new Subject<any>();
    const listPeriodsSpy = jasmine.createSpy('listPeriods').and.returnValues(of({ periods: [period] }), listPeriods$);
    const listStatementsSpy = jasmine.createSpy('listStatements').and.returnValues(of({ statements: [stmt({})] }), listStatements$);
    const service = {
      listPeriods: listPeriodsSpy,
      listRuns: () => of({ runs: [run] }),
      listStatements: listStatementsSpy,
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
      calculatePeriod: () => of({}),
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();

    // Real first load already resolved synchronously.
    expect(fixture.componentInstance.periodsLoading).toBe(false);
    expect(fixture.componentInstance.statementsLoading).toBe(false);
    expect(fixture.debugElement.query(By.css('.bo-current-period'))).toBeTruthy();

    fixture.componentInstance.calculatePeriod(period);
    fixture.detectChanges();

    // Never flip back to the blanking flags -- refreshing instead.
    expect(fixture.componentInstance.periodsLoading).toBe(false);
    expect(fixture.componentInstance.statementsLoading).toBe(false);
    expect(fixture.componentInstance.periodsRefreshing).toBe(true);
    expect(fixture.componentInstance.statementsRefreshing).toBe(true);

    // The content stays in the DOM, dimmed, "טוען..." never reappears in
    // its place.
    const currentPeriodCard = fixture.debugElement.query(By.css('.bo-current-period'));
    expect(currentPeriodCard).toBeTruthy();
    expect(currentPeriodCard.nativeElement.classList).toContain('refreshing');

    listPeriods$.next({ periods: [period] });
    listPeriods$.complete();
    listStatements$.next({ statements: [stmt({})] });
    listStatements$.complete();
    fixture.detectChanges();
    expect(fixture.componentInstance.periodsRefreshing).toBe(false);
    expect(fixture.componentInstance.statementsRefreshing).toBe(false);
  });

  it('"הגדרות עמותות": a readiness refresh (e.g. after a billing-setup save) dims the existing table instead of blanking it', async () => {
    const entity: BillingReadinessEntity = {
      id: 'entity-a', display_name: 'עמותת א', billing_account_id: 'ba-1',
      fee_rate: '0.03', vat_rate: '0.18', enforcement_status: 'active', preferred_collection_method: 'card',
      masav_authorized: false, masav_configured: false, paid_donation_count: 1, paid_gross_total: '10.00',
    };
    const getReadiness$ = new Subject<any>();
    const getReadinessSpy = jasmine.createSpy('getReadiness').and.returnValues(of({ entities: [entity] }), getReadiness$);
    const opsStub = {
      listPeriods: () => of({ periods: [] }), listRuns: () => of({ runs: [] }),
      listStatements: () => of({ statements: [] }),
      listBlockedMasavStatements: () => of({ statements: [] }), listActionableMasavStatements: () => of({ statements: [] }),
    };
    const provisioningStub = { getReadiness: getReadinessSpy, getByEntityId: () => of({ account: null }), getUnprovisioned: () => of({ entities: [] }) };
    const settingsStub = { get: () => of({ setting: { vat_rate: '0.18', updated_at: '', updated_by: null } }) };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: BillingOpsService, useValue: opsStub },
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingSettingsService, useValue: settingsStub },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('entities');
    fixture.detectChanges();

    expect(fixture.componentInstance.readinessLoading).toBe(false);

    fixture.componentInstance.loadReadiness(); // same call billingAccountCreated/masavChanged trigger
    fixture.detectChanges();

    expect(fixture.componentInstance.readinessLoading).toBe(false);
    expect(fixture.componentInstance.readinessRefreshing).toBe(true);
    const tableWrap = fixture.debugElement.query(By.css('.bo-table-wrap'));
    expect(tableWrap).toBeTruthy();
    expect(tableWrap.nativeElement.classList).toContain('refreshing');

    getReadiness$.next({ entities: [entity] });
    getReadiness$.complete();
    fixture.detectChanges();
    expect(fixture.componentInstance.readinessRefreshing).toBe(false);
  });

  it('"מס״ב": a blocked-statements refresh dims the existing table instead of blanking it', async () => {
    const blocked = {
      statement_id: 's-1', entity_id: 'entity-a', entity_name: 'עמותת א', total_due: '5000.00',
      reason: 'no_billing_account', period_start: '2026-08-01T00:00:00.000Z', period_end: '2026-08-31T23:59:59.999Z',
    };
    const listBlocked$ = new Subject<any>();
    const listBlockedSpy = jasmine.createSpy('listBlockedMasavStatements').and.returnValues(of({ statements: [blocked] }), listBlocked$);
    const service = {
      listPeriods: () => of({ periods: [] }), listRuns: () => of({ runs: [] }),
      listStatements: () => of({ statements: [] }),
      listBlockedMasavStatements: listBlockedSpy, listActionableMasavStatements: () => of({ statements: [] }),
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('masav');
    fixture.detectChanges();

    expect(fixture.componentInstance.masavLoading).toBe(false);

    fixture.componentInstance.loadMasav(); // same call closeBillingSetup()/openMasavAttempt() trigger
    fixture.detectChanges();

    expect(fixture.componentInstance.masavLoading).toBe(false);
    expect(fixture.componentInstance.masavRefreshing).toBe(true);
    const tableWrap = fixture.debugElement.query(By.css('.bo-table-wrap'));
    expect(tableWrap).toBeTruthy();
    expect(tableWrap.nativeElement.classList).toContain('refreshing');

    listBlocked$.next({ statements: [blocked] });
    listBlocked$.complete();
    fixture.detectChanges();
    expect(fixture.componentInstance.masavRefreshing).toBe(false);
  });
});

// Regression coverage for the 2026-09-16 MASAV export UX simplification:
// the operator no longer opens a "collection attempt" as a separate step
// ("פתיחת ניסיון גבייה" removed entirely) -- every ready Statement is
// selectable immediately, and exportSelected() ensures/reuses the required
// attempt itself via ensureMasavAttempts() -> the same openMasavAttempt()
// logic, unchanged, just called from the export click instead of a
// dedicated button. A Statement that stops being ready before export is
// excluded and named, never silently dropped.
describe('PlatformBillingOpsPageComponent - מס״ב export auto-attempt (2026-09-16 UX simplification)', () => {
  function actionable(overrides: Partial<ActionableMasavStatement>): ActionableMasavStatement {
    return {
      statement_id: 's-1', total_due: '5000.00', status: 'approved', created_at: '2026-09-01T00:00:00.000Z',
      entity_id: 'entity-1', entity_name: 'עמותת האור', bank_code: '12', branch_code: '345', account_number: '000123',
      attempt_id: null, attempt_status: null, attempt_number: null,
      ...overrides,
    };
  }

  async function setup(overrides: Record<string, any> = {}) {
    const service = {
      listPeriods: () => of({ periods: [] }), listRuns: () => of({ runs: [] }),
      listStatements: () => of({ statements: [] }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [actionable({})] }),
      ensureMasavAttempts: jasmine.createSpy('ensureMasavAttempts').and.returnValue(
        of({ results: [{ statementId: 's-1', skipped: false, attemptId: 'att-1' }] }),
      ),
      exportMasavExcel: jasmine.createSpy('exportMasavExcel').and.returnValue(of(new Blob(['x']))),
      ...overrides,
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('masav');
    fixture.detectChanges();
    return { fixture, service };
  }

  it('1. a ready Statement is selectable immediately -- no "פתיחת ניסיון גבייה" button, checkbox always present', async () => {
    const { fixture } = await setup();
    const checkbox = fixture.debugElement.query(By.css('.bo-checkbox-col input[type="checkbox"]'));
    expect(checkbox).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('פתיחת ניסיון גבייה');
    expect(fixture.nativeElement.textContent).not.toContain('סטטוס ניסיון');
  });

  it('2. export ensures/creates the pending attempt automatically, then downloads the excel for the ready ids -- clean export stays silent', async () => {
    const { fixture, service } = await setup();
    fixture.componentInstance.toggleExportSelection('s-1');
    fixture.componentInstance.exportSelected();
    fixture.detectChanges();

    expect(service.ensureMasavAttempts).toHaveBeenCalledWith(['s-1']);
    expect(service.exportMasavExcel).toHaveBeenCalledWith(['s-1']);
    expect(fixture.componentInstance.masavExportResult).toBeNull();
  });

  it('3. an existing pending attempt is reused (idempotent) -- still included in export, not recreated', async () => {
    const { fixture, service } = await setup({
      ensureMasavAttempts: jasmine.createSpy('ensureMasavAttempts').and.returnValue(
        of({ results: [{ statementId: 's-1', skipped: true, reason: 'attempt_already_active', attemptId: 'att-existing' }] }),
      ),
    });
    fixture.componentInstance.toggleExportSelection('s-1');
    fixture.componentInstance.exportSelected();
    fixture.detectChanges();

    expect(service.exportMasavExcel).toHaveBeenCalledWith(['s-1']); // reused attempt still exports
  });

  it('4. a Statement that becomes non-ready before export is excluded and clearly named -- never silently dropped', async () => {
    const { fixture, service } = await setup({
      listActionableMasavStatements: () => of({
        statements: [
          actionable({ statement_id: 's-1', entity_name: 'עמותת האור' }),
          actionable({ statement_id: 's-2', entity_name: 'עמותת הזריחה' }),
        ],
      }),
      ensureMasavAttempts: jasmine.createSpy('ensureMasavAttempts').and.returnValue(of({
        results: [
          { statementId: 's-1', skipped: false, attemptId: 'att-1' },
          { statementId: 's-2', skipped: true, reason: 'masav_not_authorized' },
        ],
      })),
    });
    fixture.componentInstance.toggleExportSelection('s-1');
    fixture.componentInstance.toggleExportSelection('s-2');
    fixture.componentInstance.exportSelected();
    fixture.detectChanges();

    expect(service.exportMasavExcel).toHaveBeenCalledWith(['s-1']); // only the still-ready one
    expect(fixture.componentInstance.masavExportResult?.successText).toContain('1');
    expect(fixture.componentInstance.masavExportResult?.excludedText).toContain('עמותת הזריחה');
    expect(fixture.componentInstance.masavExportResult?.excludedText).toContain('לא אושרה הרשאה');
  });

  it('4b. when none of the selected Statements are still ready, no file is exported and the operator sees why', async () => {
    const { fixture, service } = await setup({
      ensureMasavAttempts: jasmine.createSpy('ensureMasavAttempts').and.returnValue(
        of({ results: [{ statementId: 's-1', skipped: true, reason: 'not_masav_routed' }] }),
      ),
    });
    fixture.componentInstance.toggleExportSelection('s-1');
    fixture.componentInstance.exportSelected();
    fixture.detectChanges();

    expect(service.exportMasavExcel).not.toHaveBeenCalled();
    expect(fixture.componentInstance.exportError).toContain('עמותת האור');
  });

  it('5. ensureMasavAttempts is called exactly once per export click, with exactly the selected ids -- no extra attempt-creation logic invented client-side', async () => {
    const { fixture, service } = await setup({
      listActionableMasavStatements: () => of({
        statements: [
          actionable({ statement_id: 's-1' }),
          actionable({ statement_id: 's-2', entity_name: 'עמותת הזריחה' }),
        ],
      }),
      ensureMasavAttempts: jasmine.createSpy('ensureMasavAttempts').and.returnValue(of({
        results: [
          { statementId: 's-1', skipped: false, attemptId: 'att-1' },
          { statementId: 's-2', skipped: false, attemptId: 'att-2' },
        ],
      })),
    });
    fixture.componentInstance.toggleExportSelection('s-1');
    fixture.componentInstance.toggleExportSelection('s-2');
    fixture.componentInstance.exportSelected();
    fixture.detectChanges();

    expect(service.ensureMasavAttempts).toHaveBeenCalledTimes(1);
    expect(service.ensureMasavAttempts).toHaveBeenCalledWith(['s-1', 's-2']);
  });
});

// Regression coverage for the 2026-09-16 "דורש טיפול" task-list redesign:
// a finding with a known fix (entity missing a billing account, or a MASAV
// Statement blocked on setup/authorization) must surface the specific
// reason, the association + amount, and a working action button -- reusing
// openBillingSetup(), never a new destination. Every other finding type
// must keep rendering exactly as before (no button invented for it).
describe('PlatformBillingOpsPageComponent - "דורש טיפול" task list (2026-09-16)', () => {
  function emptyHealth(): HealthResponse {
    return { webhooks: [], jobs: [], knownJobs: [], schedulerHeartbeat: { lastHeartbeatAt: null, minutesSinceLastHeartbeat: null, healthy: true }, alerts: [] };
  }

  function finding(overrides: Partial<ReconciliationFinding>): ReconciliationFinding {
    return {
      id: 1, job_name: 'billing-provisioning-gap', finding_type: 'active_entity_missing_billing_account',
      severity: 'warning', subject_type: 'entity', subject_id: 'entity-1', details: {},
      found_at: '2026-09-16T00:00:00.000Z', last_seen_at: '2026-09-16T00:00:00.000Z', resolved_at: null, resolved_by: null,
      ...overrides,
    };
  }

  async function setup(findings: ReconciliationFinding[], readinessEntities: Partial<BillingReadinessEntity>[] = []) {
    const cardcomStub = {
      getHealth: () => of(emptyHealth()),
      getFindings: () => of({ findings }),
    };
    const provisioningStub = {
      getReadiness: () => of({ entities: readinessEntities as BillingReadinessEntity[] }),
      getByEntityId: () => of({ account: null }),
      getUnprovisioned: () => of({ entities: [] }),
    };
    const service = {
      listPeriods: () => of({ periods: [] }), listRuns: () => of({ runs: [] }),
      listStatements: () => of({ statements: [] }),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
    };
    const settingsStub = { get: () => of({ setting: { vat_rate: '0.18', updated_at: '', updated_by: null } }) };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: BillingOpsService, useValue: service },
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingSettingsService, useValue: settingsStub },
        { provide: CardcomOpsService, useValue: cardcomStub },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    return { fixture };
  }

  it('heading reads "דורש טיפול" regardless of count -- no "X דברים דורשים טיפול"', async () => {
    const { fixture } = await setup([finding({}), finding({ id: 2, subject_id: 'entity-2' })]);
    const title = fixture.debugElement.query(By.css('.bo-card-title'));
    expect(title.nativeElement.textContent.trim()).toBe('🔴 דורש טיפול');
  });

  it('active_entity_missing_billing_account: shows the association + amount + a button that opens Billing Setup for that exact entity', async () => {
    const { fixture } = await setup([
      finding({
        finding_type: 'active_entity_missing_billing_account', subject_id: 'entity-abc',
        details: { displayName: 'עמותת הזריחה', paidDonationCount: 8, paidGrossTotal: '207.00' },
      }),
    ]);

    const row = fixture.debugElement.query(By.css('.bo-issue-row'));
    expect(row.nativeElement.textContent).toContain('טרם הוגדר חשבון חיוב');
    expect(row.nativeElement.textContent).toContain('עמותת הזריחה');
    expect(row.nativeElement.textContent).toContain('207.00');

    const button = row.query(By.css('.bo-issue-action'));
    expect(button.nativeElement.textContent).toContain('להגדרת חיוב');
    button.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.billingSetupEntityId).toBe('entity-abc');
    expect(fixture.componentInstance.billingSetupEntityName).toBe('עמותת הזריחה');
  });

  it('masav_blocked_pending_authorization + masav_not_configured: specific reason "חסרים פרטי חשבון בנק", entity name resolved from readinessEntities (no new backend call)', async () => {
    const { fixture } = await setup(
      [finding({
        finding_type: 'masav_blocked_pending_authorization', subject_type: 'statement', subject_id: 'stmt-1',
        details: { reason: 'masav_not_configured', entityId: 'entity-xyz', totalDue: '4820.00' },
      })],
      [{ id: 'entity-xyz', display_name: 'קרן אור לילד' }],
    );

    const row = fixture.debugElement.query(By.css('.bo-issue-row'));
    expect(row.nativeElement.textContent).toContain('חסרים פרטי חשבון בנק');
    expect(row.nativeElement.textContent).toContain('קרן אור לילד');
    expect(row.nativeElement.textContent).toContain('4820.00');
    expect(row.nativeElement.textContent).toContain('להשלמת הגדרות מס״ב');
  });

  it('masav_blocked_pending_authorization + masav_not_authorized: specific reason "נדרש אישור מס״ב"', async () => {
    const { fixture } = await setup(
      [finding({
        finding_type: 'masav_blocked_pending_authorization', subject_type: 'statement', subject_id: 'stmt-2',
        details: { reason: 'masav_not_authorized', entityId: 'entity-xyz', totalDue: '6000.00' },
      })],
      [{ id: 'entity-xyz', display_name: 'קרן אור לילד' }],
    );

    const row = fixture.debugElement.query(By.css('.bo-issue-row'));
    expect(row.nativeElement.textContent).toContain('נדרש אישור מס״ב');
  });

  it('a finding type with no known fix (e.g. no_active_payment_instrument) stays a plain informational row -- no button invented', async () => {
    const { fixture } = await setup([
      finding({
        finding_type: 'no_active_payment_instrument', job_name: 'collection-router', subject_type: 'statement', subject_id: 'stmt-3',
        details: { entityId: 'entity-xyz' },
      }),
    ]);

    const row = fixture.debugElement.query(By.css('.bo-issue-row'));
    expect(row.nativeElement.textContent).toContain('אין אמצעי תשלום פעיל לגבייה');
    expect(row.query(By.css('.bo-issue-action'))).toBeFalsy();
  });
});

// Regression coverage for the 2026-09-17 "כל החיובים" filter-dropdown UX
// fix: the חודש dropdown used to render raw fmtDateTime() start/end
// timestamps (retired test/harness periods included, since listPeriods()
// never filtered them); the מצב dropdown exposed raw statements.status
// values ("מאושר"/"בגבייה") that never actually appear in the table's own
// מצב column, which already collapses approved/open into "ממתין לגבייה"/
// "הגבייה נכשלה" via operationalStateLabel(). Both dropdowns now show only
// what the operator would actually recognize from this same screen.
describe('PlatformBillingOpsPageComponent - "כל החיובים" filter dropdowns (2026-09-17)', () => {
  async function setup(periods: BillingPeriod[], overrides: Record<string, any> = {}) {
    const service = {
      listPeriods: () => of({ periods }),
      listRuns: () => of({ runs: [] }),
      listStatements: jasmine.createSpy('listStatements').and.returnValue(of({ statements: [] })),
      listBlockedMasavStatements: () => of({ statements: [] }),
      listActionableMasavStatements: () => of({ statements: [] }),
      ...overrides,
    };
    await TestBed.configureTestingModule({
      imports: [PlatformBillingOpsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: BillingOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformBillingOpsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('statements');
    fixture.detectChanges();
    return { fixture, service };
  }

  it('month dropdown: a real calendar-month period renders as plain Hebrew month/year, with the real period id as the option value', async () => {
    const period: BillingPeriod = {
      id: 'period-nov-2026', period_start: '2026-11-01T00:00:00.000Z', period_end: '2026-12-01T00:00:00.000Z',
      created_at: '2026-11-01T00:00:00.000Z', retired: false, run_count: 0,
    };
    const { fixture } = await setup([period]);

    const options = fixture.debugElement.queryAll(By.css('.ba-field select'))[0].queryAll(By.css('option'));
    const periodOption = options.find((o) => o.nativeElement.value === 'period-nov-2026');
    expect(periodOption).toBeTruthy();
    expect(periodOption!.nativeElement.textContent.trim()).toBe('נובמבר 2026');
    // No raw timestamp leaks into the label.
    expect(periodOption!.nativeElement.textContent).not.toContain('2026-11-01');
    expect(periodOption!.nativeElement.textContent).not.toContain(':');
  });

  it('month dropdown: a genuine non-calendar period (doesn\'t start on the 1st) falls back to a real date range, not a false month label', async () => {
    const period: BillingPeriod = {
      id: 'period-custom', period_start: '2026-08-15T00:00:00.000Z', period_end: '2026-08-20T00:00:00.000Z',
      created_at: '2026-08-15T00:00:00.000Z', retired: false, run_count: 0,
    };
    const { fixture } = await setup([period]);

    const options = fixture.debugElement.queryAll(By.css('.ba-field select'))[0].queryAll(By.css('option'));
    const periodOption = options.find((o) => o.nativeElement.value === 'period-custom');
    expect(periodOption!.nativeElement.textContent).toContain('15/08/2026');
    expect(periodOption!.nativeElement.textContent).not.toMatch(/^אוגוסט/);
  });

  it('status dropdown: options are exactly the operational buckets shown in the מצב column -- no raw "approved"/"open" values exposed', async () => {
    const { fixture } = await setup([]);
    const selects = fixture.debugElement.queryAll(By.css('.ba-field select'));
    const statusSelect = selects[1];
    const values = statusSelect.queryAll(By.css('option')).map((o) => o.nativeElement.value);
    expect(values).toEqual(['', 'draft', 'pending_collection', 'collection_failed', 'paid', 'abandoned', 'cancelled', 'written_off']);
    expect(values).not.toContain('approved');
    expect(values).not.toContain('open');

    const labels = statusSelect.queryAll(By.css('option')).map((o) => o.nativeElement.textContent.trim());
    expect(labels).toEqual(['הכל', 'ממתין לאישור', 'ממתין לגבייה', 'הגבייה נכשלה', 'שולם', 'בוטל (טיוטה)', 'מבוטל', 'נמחק כחוב אבוד']);
  });

  it('selecting a status filter passes the operational key straight through to listStatements() unchanged', async () => {
    const { fixture, service } = await setup([]);
    fixture.componentInstance.filterStatus = 'collection_failed';
    fixture.componentInstance.loadStatements();
    expect((service.listStatements as jasmine.Spy)).toHaveBeenCalledWith(
      jasmine.objectContaining({ status: 'collection_failed' }),
    );
  });
});
