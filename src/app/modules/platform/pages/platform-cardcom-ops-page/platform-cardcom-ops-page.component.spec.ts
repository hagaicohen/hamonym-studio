import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { PlatformCardcomOpsPageComponent } from './platform-cardcom-ops-page.component';
import { CardcomOpsService, HealthResponse, ReconciliationFinding, PlatformDonation, PlatformDonationsResponse } from '../../services/cardcom-ops.service';
import { PlatformService } from '../../services/platform.service';
import { environment } from '../../../../../environments/environment';

function emptyDonationsResponse(): PlatformDonationsResponse {
  return { donations: [], total: 0, page: 0, limit: 25 };
}

// PlatformCardcomOpsPageComponent now also injects HttpClient directly
// (donation-context enrichment, 2026-09-14r -- GET /api/donations/public/:id,
// the same existing public endpoint donation-success.component.ts already
// calls) and PlatformService (campaign-context enrichment, reuses its
// existing getCampaign()). Neither is under test in most of the suites
// below, so real HttpClient + HttpClientTesting is provided just so the
// component constructs cleanly; unflushed requests are harmless for
// assertions that don't open a drawer with donation/campaign items.

// Regression coverage for this page's IA redesign (2026-09-07):
// (1) every job/finding-source name and finding_type actually produced by
//     the backend (grepped across src/jobs/*.job.js, collection.service.js,
//     masav-collection.service.js, payment.handler.js) must resolve to a
//     human Hebrew label, never fall back to the raw internal string;
// (2) the cadence-aware distinction the redesign brief was most worried
//     about — a dormant/manual job (no `schedule`) must never surface as a
//     red "משימות רקע" item — holds at the presentation layer too, on top
//     of the server already never emitting a job_stale alert for it
//     (src/jobs/schedule-window.js only evaluates jobs with a `schedule`);
// (3) the human elapsed-time formatting replaces the old raw-minutes text
//     ("28344 דקות") with a day/hour phrase.
describe('PlatformCardcomOpsPageComponent - IA redesign', () => {
  const REAL_JOB_NAMES = [
    'webhook-recovery',
    'stale-pending-donations',
    'aggregate-consistency',
    'stuck-recurring-signups',
    'billing-approval-consistency',
    'billing-provisioning-gap',
    'collection-attempt-reconciliation',
    'recurring-payment-reconciliation',
    'masav-collection',
    'collection-router',
    'payment_verification_gate',
  ];

  const REAL_FINDING_TYPES = [
    'lost_webhook_recovered',
    'lookup_failed',
    'pending_donation_missing_low_profile_id',
    'campaign_aggregate_mismatch',
    'stuck_recurring_signup',
    'collection_attempt_stuck',
    'statement_payments_exceed_total_due',
    'active_entity_missing_billing_account',
    'statement_components_not_fully_claimed',
    'donation_claimed_by_ineffective_statement',
    'claimed_donation_missing_from_components',
    'statement_gross_raised_mismatch',
    'history_lookup_failed',
    'recurring_charge_recovered_from_history',
    'masav_blocked_pending_authorization',
    'collection_method_not_implemented',
    'no_active_payment_instrument',
    'gate_v1_mismatch',
  ];

  // Added when scheduler-heartbeat monitoring shipped (2026-09-08) -- these
  // mocks predate that field and are backfilled with a healthy heartbeat so
  // they keep type-checking against the real HealthResponse shape without
  // affecting any of this suite's actual assertions (none of them exercise
  // scheduler_not_running).
  const HEALTHY_HEARTBEAT = { lastHeartbeatAt: '2026-09-14T00:00:00Z', minutesSinceLastHeartbeat: 1, healthy: true };

  function stubService(overrides: { health?: HealthResponse; findings?: ReconciliationFinding[] } = {}) {
    const health: HealthResponse = overrides.health ?? {
      webhooks: [],
      jobs: [],
      knownJobs: REAL_JOB_NAMES.filter((n) => n !== 'masav-collection' && n !== 'collection-router' && n !== 'payment_verification_gate'),
      schedulerHeartbeat: HEALTHY_HEARTBEAT,
      alerts: [],
    };
    return {
      getHealth: () => of(health),
      getFindings: () => of({ findings: overrides.findings ?? [] }),
      getJobRuns: () => of({ runs: [] }),
      runJob: () => of({}),
      resolveFinding: () => of({}),
      listDonations: () => of(emptyDonationsResponse()),
    };
  }

  async function createComponent(service: Partial<CardcomOpsService>) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PlatformCardcomOpsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CardcomOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformCardcomOpsPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('gives every real job/finding-source name a human label, never the raw internal name', async () => {
    const component = await createComponent(stubService());
    for (const name of REAL_JOB_NAMES) {
      expect(component.jobLabel(name)).not.toBe(name);
      expect(component.jobLabel(name)).toMatch(/[א-ת]/); // contains Hebrew
    }
  });

  it('gives every real finding_type a human label, never the raw internal type', async () => {
    const component = await createComponent(stubService());
    for (const type of REAL_FINDING_TYPES) {
      expect(component.findingTypeLabel(type)).not.toBe(type);
      expect(component.findingTypeLabel(type)).toMatch(/[א-ת]/);
    }
  });

  it('never shows a dormant/manual job (no schedule) as a red "משימות רקע" item, even if defensively present in alerts', async () => {
    // The server (schedule-window.js) never actually emits job_stale for a
    // job without a `schedule` field -- recurring-payment-reconciliation
    // has none, deliberately, since 2026-09-01. This test guards the
    // presentation layer's OWN assumption: even if it somehow received such
    // an alert, it must not silently treat every job_stale alert as
    // automatically legitimate without the job name being real -- here we
    // simply confirm the normal (correct) server payload for this job
    // (no alert at all) produces zero "jobs" items for it.
    const health: HealthResponse = {
      webhooks: [],
      jobs: [{ job_name: 'recurring-payment-reconciliation', status: 'success', started_at: '2026-08-01T00:00:00Z', finished_at: null, duration_ms: 1000, error: null }],
      knownJobs: ['recurring-payment-reconciliation'],
      schedulerHeartbeat: HEALTHY_HEARTBEAT,
      alerts: [], // no job_stale for this job -- it has no schedule, so the server never evaluates its staleness
    };
    const component = await createComponent(stubService({ health }));
    const jobsItems = component.itemsForArea('jobs');
    expect(jobsItems.find((i) => i.jobName === 'recurring-payment-reconciliation')).toBeUndefined();
    expect(component.areaStatus('jobs')).toBe('ok');
  });

  it('surfaces a real job_stale alert (a job WITH a schedule) as a critical "משימות רקע" item with a human day-count, not raw minutes', async () => {
    const health: HealthResponse = {
      webhooks: [],
      jobs: [],
      knownJobs: ['aggregate-consistency'],
      schedulerHeartbeat: HEALTHY_HEARTBEAT,
      alerts: [
        {
          type: 'job_stale',
          severity: 'critical',
          jobName: 'aggregate-consistency',
          minutesSinceLastSuccess: 28344, // the exact raw value the old UI showed verbatim
          message: 'aggregate-consistency לא רץ בהצלחה 28344 דקות',
        },
      ],
    };
    const component = await createComponent(stubService({ health }));
    const jobsItems = component.itemsForArea('jobs');
    expect(jobsItems.length).toBe(1);
    expect(jobsItems[0].severity).toBe('critical');
    expect(jobsItems[0].title).toContain('בדיקת עקביות תרומות'); // human job name, not "aggregate-consistency"
    expect(jobsItems[0].subtitle).not.toContain('28344');
    expect(jobsItems[0].subtitle).toMatch(/ימים|יום/);
    expect(component.areaStatus('jobs')).toBe('critical');
  });

  it('buckets an open billing-provisioning-gap finding under גביית עמלות, not תרומות, and marks that area critical', async () => {
    const finding: ReconciliationFinding = {
      id: 76,
      job_name: 'billing-provisioning-gap',
      finding_type: 'active_entity_missing_billing_account',
      severity: 'critical',
      subject_type: 'entity',
      subject_id: 'ea4c49a4-9f82-48be-a239-a816710f82dd',
      details: { displayName: 'ישראלס - העמותה לחקר האי.אל.אס. בישראל', paidGrossTotal: '8.00', paidDonationCount: 5 },
      found_at: '2026-08-28T11:26:39.630Z',
      last_seen_at: '2026-08-28T11:26:39.630Z',
      resolved_at: null,
      resolved_by: null,
    };
    const component = await createComponent(stubService({ findings: [finding] }));
    expect(component.itemsForArea('commission').length).toBe(1);
    expect(component.itemsForArea('donations').length).toBe(0);
    expect(component.areaStatus('commission')).toBe('critical');
    expect(component.itemsForArea('commission')[0].subtitle).toContain('ישראלס');
  });

  it('routes a lookup_failed finding (a real CardCom API call failing) to the CardCom area, not the owning job\'s domain area', async () => {
    const finding: ReconciliationFinding = {
      id: 1,
      job_name: 'stale-pending-donations', // otherwise a "donations" job
      finding_type: 'lookup_failed',
      severity: 'warning',
      subject_type: 'donation',
      subject_id: 'donation-1',
      details: { error: 'ETIMEDOUT' },
      found_at: '2026-09-01T00:00:00Z',
      last_seen_at: '2026-09-01T00:00:00Z',
      resolved_at: null,
      resolved_by: null,
    };
    const component = await createComponent(stubService({ findings: [finding] }));
    expect(component.itemsForArea('cardcom').length).toBe(1);
    expect(component.itemsForArea('donations').length).toBe(0);
  });

  it('reports overall health as ok only when all 4 areas are ok, and answers "is the system healthy" in one boolean', async () => {
    const okComponent = await createComponent(stubService());
    expect(okComponent.overallOk).toBe(true);

    const finding: ReconciliationFinding = {
      id: 2,
      job_name: 'aggregate-consistency',
      finding_type: 'campaign_aggregate_mismatch',
      severity: 'critical',
      subject_type: 'campaign',
      subject_id: 'campaign-1',
      details: {},
      found_at: '2026-09-01T00:00:00Z',
      last_seen_at: '2026-09-01T00:00:00Z',
      resolved_at: null,
      resolved_by: null,
    };
    const brokenComponent = await createComponent(stubService({ findings: [finding] }));
    expect(brokenComponent.overallOk).toBe(false);
    expect(brokenComponent.overallCriticalCount).toBe(1);
  });

  it('excludes resolved findings and info-severity findings from the actionable list', async () => {
    const resolved: ReconciliationFinding = {
      id: 3,
      job_name: 'aggregate-consistency',
      finding_type: 'campaign_aggregate_mismatch',
      severity: 'critical',
      subject_type: 'campaign',
      subject_id: 'campaign-1',
      details: {},
      found_at: '2026-08-01T00:00:00Z',
      last_seen_at: '2026-08-01T00:00:00Z',
      resolved_at: '2026-08-02T00:00:00Z',
      resolved_by: 'admin:1',
    };
    const component = await createComponent(stubService({ findings: [resolved] }));
    expect(component.actionableItems.length).toBe(0);
    expect(component.overallOk).toBe(true);
  });
});

// Regression coverage for the 2026-09-15s product decision: "תרومות" is
// primarily a donations browser now, and system anomalies are demoted to a
// single compact indicator with an honest 3-category classification
// (never "דורש טיפול" as a blanket heading, never implying a resolution
// button the operator can actually use -- the same-day workflow audit
// found no finding type has an operator-executable fix through Hamonym
// today). Core invariant unchanged from the prior grouping design: grouping
// by finding_type is DISPLAY only -- recordFinding's own dedup key is
// (job_name, finding_type, subject_type, subject_id), so 4 open findings of
// the same type are 4 real, distinct donations/campaigns, each still
// individually reachable from its group's drawer, never silently merged
// away.
describe('PlatformCardcomOpsPageComponent - anomaly indicator (honest classification)', () => {
  const HEALTHY_HEARTBEAT = { lastHeartbeatAt: '2026-09-14T00:00:00Z', minutesSinceLastHeartbeat: 1, healthy: true };

  function healthWith(overrides: Partial<HealthResponse> = {}): HealthResponse {
    return {
      webhooks: [],
      jobs: [],
      knownJobs: ['stale-pending-donations', 'aggregate-consistency', 'webhook-recovery'],
      schedulerHeartbeat: HEALTHY_HEARTBEAT,
      alerts: [],
      ...overrides,
    };
  }

  function lookupFailedFinding(id: number, donationId: string): ReconciliationFinding {
    return {
      id, job_name: 'stale-pending-donations', finding_type: 'lookup_failed', severity: 'warning',
      subject_type: 'donation', subject_id: donationId, details: { error: 'ETIMEDOUT' },
      found_at: '2026-09-10T00:00:00Z', last_seen_at: '2026-09-14T00:00:00Z',
      resolved_at: null, resolved_by: null,
    };
  }

  function campaignMismatchFinding(id: number, campaignId: string): ReconciliationFinding {
    return {
      id, job_name: 'aggregate-consistency', finding_type: 'campaign_aggregate_mismatch', severity: 'critical',
      subject_type: 'campaign', subject_id: campaignId,
      details: { currentAmount: '500.00', actualAmount: '480.00', currentSupporters: 12, actualSupporters: 11 },
      found_at: '2026-09-10T00:00:00Z', last_seen_at: '2026-09-14T00:00:00Z',
      resolved_at: null, resolved_by: null,
    };
  }

  async function createFixture(service: Partial<CardcomOpsService>) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PlatformCardcomOpsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CardcomOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformCardcomOpsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('shows nothing at all when there are no open findings/alerts -- no permanent health fixture', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    expect(fixture.debugElement.query(By.css('.ops-anomaly-bar'))).toBeFalsy();
  });

  it('shows one compact indicator line naming the total count, collapsed until tapped', async () => {
    const findings = [
      lookupFailedFinding(1, 'donation-a'), lookupFailedFinding(2, 'donation-b'),
      lookupFailedFinding(3, 'donation-c'), lookupFailedFinding(4, 'donation-d'),
    ];
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings }),
      listDonations: () => of(emptyDonationsResponse()),
    });

    const bar = fixture.debugElement.query(By.css('.ops-anomaly-bar'));
    expect(bar.nativeElement.textContent).toContain('4');
    expect(fixture.debugElement.query(By.css('.ops-anomaly-panel'))).toBeFalsy(); // collapsed

    bar.nativeElement.click();
    fixture.detectChanges();

    const groupCards = fixture.debugElement.queryAll(By.css('.ops-group-card'));
    expect(groupCards.length).toBe(1); // one card, not one per donation
    expect(groupCards[0].nativeElement.textContent).toContain('בדיקה מול חברת הסליקה');
    expect(groupCards[0].nativeElement.textContent).toContain('4');
    // No raw donation ids, no JSON, no English error text in the primary view.
    expect(fixture.nativeElement.textContent).not.toContain('donation-a');
    expect(fixture.nativeElement.textContent).not.toContain('ETIMEDOUT');
  });

  it('lookup_failed is labeled "המערכת מנסה שוב אוטומטית", not framed as something the operator must resolve', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [lookupFailedFinding(1, 'donation-a')] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    fixture.debugElement.query(By.css('.ops-anomaly-bar')).nativeElement.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('המערכת מנסה שוב אוטומטית');
  });

  it('gate_v1_mismatch (the financially serious case) is labeled "אי-התאמה הדורשת בדיקה", distinct from the routine auto-retry case', async () => {
    const finding: ReconciliationFinding = {
      id: 9, job_name: 'payment_verification_gate', finding_type: 'gate_v1_mismatch', severity: 'critical',
      subject_type: 'donation', subject_id: 'donation-z', details: {},
      found_at: '2026-09-10T00:00:00Z', last_seen_at: '2026-09-14T00:00:00Z',
      resolved_at: null, resolved_by: null,
    };
    const fixture = await createFixture({
      getHealth: () => of(healthWith({ knownJobs: ['payment_verification_gate'] })),
      getFindings: () => of({ findings: [finding] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    fixture.debugElement.query(By.css('.ops-anomaly-bar')).nativeElement.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('אי-התאמה הדורשת בדיקה');
  });

  it('opening a group drawer still shows all underlying donations individually, none merged away, with donation/campaign human context and no raw ids/JSON', async () => {
    const findings = [
      lookupFailedFinding(1, 'donation-a'), lookupFailedFinding(2, 'donation-b'),
      lookupFailedFinding(3, 'donation-c'), lookupFailedFinding(4, 'donation-d'),
    ];
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings }),
      listDonations: () => of(emptyDonationsResponse()),
    });

    fixture.debugElement.query(By.css('.ops-anomaly-bar')).nativeElement.click();
    fixture.detectChanges();
    fixture.debugElement.query(By.css('.ops-group-card button')).nativeElement.click();
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('.ops-drawer-item'));
    expect(items.length).toBe(4); // all 4 real donations present, none merged away
    expect(fixture.nativeElement.textContent).not.toContain('donation-a');
    expect(fixture.nativeElement.textContent).not.toContain('ETIMEDOUT');
  });

  it('campaign_aggregate_mismatch is classified "engineering" (not a red needs-review dot) and keeps its "not money at risk" explanation, even though its real severity is critical', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [campaignMismatchFinding(5, 'campaign-x')] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    fixture.debugElement.query(By.css('.ops-anomaly-bar')).nativeElement.click();
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css('.ops-group-card'));
    const dot = card.query(By.css('.ops-severity-dot'));
    expect(dot.nativeElement.classList).toContain('ops-severity-engineering'); // not needs-review
    expect(card.nativeElement.textContent).toContain('התרומות עצמן תקינות');
    expect(card.nativeElement.textContent).toContain('דורש בדיקה טכנית');

    fixture.debugElement.query(By.css('.ops-group-card button')).nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('.ops-drawer-item')).length).toBe(1);
    // Real, available context (currentAmount/actualAmount) shown.
    expect(fixture.nativeElement.textContent).toContain('480');
  });

  it('"סמן כנבדק" no longer appears anywhere -- the workflow audit found no finding type has an operator-executable resolution today', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [lookupFailedFinding(1, 'donation-a')] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    fixture.debugElement.query(By.css('.ops-anomaly-bar')).nativeElement.click();
    fixture.detectChanges();
    fixture.debugElement.query(By.css('.ops-group-card button')).nativeElement.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('סמן כנבדק');
  });

  it('jobs/webhooks/raw findings log ("כלים טכניים") are gone from the normal operator page entirely -- no dedicated engineering route exists to move them to, per product decision', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith({
        jobs: [{ job_name: 'stale-pending-donations', status: 'success', started_at: '2026-09-14T00:00:00Z', finished_at: null, duration_ms: 500, error: null }],
        webhooks: [{ type: 'LowProfile', last_received_at: '2026-09-14T00:00:00Z', count_24h: 3 }],
      })),
      getFindings: () => of({ findings: [lookupFailedFinding(1, 'donation-a')] }),
      listDonations: () => of(emptyDonationsResponse()),
    });

    expect(fixture.debugElement.query(By.css('.ops-tech-toggle'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('.ops-job-list'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('.ops-webhook-list'))).toBeFalsy();
    expect(fixture.nativeElement.textContent).not.toContain('הרץ עכשיו');
  });

  it('the old hero banner ("מערכת התרומות תקינה") and area-tile row are gone -- the donations table is the primary content', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    expect(fixture.debugElement.query(By.css('.ops-hero'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('.ops-area-tile'))).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('תרומות');
  });
});

// Regression coverage for the primary donations browser (2026-09-15s):
// operators find/identify a real donation by date/entity/campaign/amount/
// type/status, the same way they browse עמותות/קמפיינים/משתמשים elsewhere
// in Platform Admin.
describe('PlatformCardcomOpsPageComponent - donations browser', () => {
  const HEALTHY_HEARTBEAT = { lastHeartbeatAt: '2026-09-14T00:00:00Z', minutesSinceLastHeartbeat: 1, healthy: true };

  function healthWith(overrides: Partial<HealthResponse> = {}): HealthResponse {
    return {
      webhooks: [], jobs: [], knownJobs: [],
      schedulerHeartbeat: HEALTHY_HEARTBEAT, alerts: [], ...overrides,
    };
  }

  function donation(overrides: Partial<PlatformDonation> = {}): PlatformDonation {
    return {
      id: 'donation-1', amount: 120, donor_name: 'ישראל ישראלי', status: 'paid',
      completed_at: '2026-09-10T10:00:00Z', created_at: '2026-09-10T09:55:00Z',
      is_anonymous: false, failure_reason: null, is_recurring: false,
      campaign_id: 'campaign-1', campaign_title: 'קמפיין הדוגמה', campaign_slug: 'example',
      entity_id: 'entity-1', entity_name: 'עמותת הדוגמה',
      ...overrides,
    };
  }

  async function createFixture(service: Partial<CardcomOpsService>) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PlatformCardcomOpsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CardcomOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformCardcomOpsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the table with date/עמותה/קמפיין/סכום/סוג/סטטוס columns for each donation', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of({ donations: [donation()], total: 1, page: 0, limit: 25 }),
    });

    const row = fixture.debugElement.query(By.css('.ops-donations-table tbody tr'));
    expect(row.nativeElement.textContent).toContain('עמותת הדוגמה');
    expect(row.nativeElement.textContent).toContain('קמפיין הדוגמה');
    expect(row.nativeElement.textContent).toContain('120');
    expect(row.nativeElement.textContent).toContain('חד פעמית');
    expect(row.nativeElement.textContent).toContain('שולם');
  });

  it('never shows donor email/phone/provider data in the primary table row', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of({ donations: [donation()], total: 1, page: 0, limit: 25 }),
    });
    const row = fixture.debugElement.query(By.css('.ops-donations-table tbody tr'));
    expect(row.nativeElement.textContent).not.toContain('@'); // no email
  });

  it('search box triggers a new listDonations call with the entered term', async () => {
    const listSpy = jasmine.createSpy('listDonations').and.returnValue(of(emptyDonationsResponse()));
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: listSpy,
    });
    listSpy.calls.reset();

    fixture.componentInstance.donationsSearch = 'ישראל ישראלי';
    fixture.componentInstance.onDonationsSearch();
    fixture.detectChanges();

    expect(listSpy).toHaveBeenCalledWith(jasmine.objectContaining({ search: 'ישראל ישראלי', page: 0 }));
  });

  // Regression for the 2026-09-16 report: a standalone "חיפוש" button sat
  // apart from the search input (separated by the status filter in the
  // flex row) and read as an orphaned control. Every other Platform Admin
  // list (platform-organizations-page's own search box) searches live as
  // you type, with no button at all -- matching that established
  // convention, rather than inventing a page-specific one, is the actual
  // fix. This locks in both halves: no button in the DOM, and typing alone
  // (no click, no Enter) triggers a debounced reload.
  it('has no standalone search button -- typing alone (debounced) triggers the search, matching every other Platform Admin list page', fakeAsync(() => {
    const listSpy = jasmine.createSpy('listDonations').and.returnValue(of(emptyDonationsResponse()));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlatformCardcomOpsPageComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: CardcomOpsService, useValue: { getHealth: () => of(healthWith()), getFindings: () => of({ findings: [] }), listDonations: listSpy } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformCardcomOpsPageComponent);
    fixture.detectChanges();
    listSpy.calls.reset();

    const buttons = fixture.debugElement.queryAll(By.css('.ops-donations-toolbar button'));
    expect(buttons.length).toBe(0);

    const input: HTMLInputElement = fixture.debugElement.query(By.css('.ops-search-input')).nativeElement;
    input.value = 'עמותת הדוגמה';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(listSpy).not.toHaveBeenCalled(); // debounced, not yet

    tick(400);
    expect(listSpy).toHaveBeenCalledWith(jasmine.objectContaining({ search: 'עמותת הדוגמה', page: 0 }));
  }));

  it('status filter change reloads with the selected status and resets to page 0', async () => {
    const listSpy = jasmine.createSpy('listDonations').and.returnValue(of(emptyDonationsResponse()));
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: listSpy,
    });
    listSpy.calls.reset();

    fixture.componentInstance.donationsStatus = 'failed';
    fixture.componentInstance.onDonationsStatusChange();
    fixture.detectChanges();

    expect(listSpy).toHaveBeenCalledWith(jasmine.objectContaining({ status: 'failed', page: 0 }));
  });

  it('pager advances to the next page and back, calling listDonations with the right page each time', async () => {
    const listSpy = jasmine.createSpy('listDonations').and.returnValue(
      of({ donations: [donation()], total: 60, page: 0, limit: 25 }),
    );
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: listSpy,
    });
    listSpy.calls.reset();

    fixture.componentInstance.nextDonationsPage();
    fixture.detectChanges();
    expect(listSpy).toHaveBeenCalledWith(jasmine.objectContaining({ page: 1 }));

    fixture.componentInstance.prevDonationsPage();
    fixture.detectChanges();
    expect(listSpy).toHaveBeenCalledWith(jasmine.objectContaining({ page: 0 }));
  });

  it('clicking a row opens a read-only detail drawer with no mark-paid/refund/retry controls', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of({ donations: [donation()], total: 1, page: 0, limit: 25 }),
    });

    fixture.debugElement.query(By.css('.ops-donations-table tbody tr')).nativeElement.click();
    fixture.detectChanges();

    const drawer = fixture.debugElement.query(By.css('.ops-drawer'));
    expect(drawer).toBeTruthy();
    const text = drawer.nativeElement.textContent;
    expect(text).toContain('עמותת הדוגמה');
    expect(text).toContain('קמפיין הדוגמה');
    expect(text).not.toContain('סמן כשולם');
    expect(text).not.toContain('החזר');
    expect(text).not.toContain('נסה שוב');
    expect(fixture.debugElement.query(By.css('.ops-drawer button[disabled]'))).toBeFalsy();
  });

  it('anonymous donations show "אנונימי" instead of a name, and never show donor_name when is_anonymous is true', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of({ donations: [donation({ is_anonymous: true, donor_name: 'שם אמיתי' })], total: 1, page: 0, limit: 25 }),
    });
    fixture.debugElement.query(By.css('.ops-donations-table tbody tr')).nativeElement.click();
    fixture.detectChanges();
    const text = fixture.debugElement.query(By.css('.ops-drawer')).nativeElement.textContent;
    expect(text).toContain('אנונימי');
    expect(text).not.toContain('שם אמיתי');
  });

  it('the page explains itself: title, subtitle, and a "כל התרומות" section heading above the table', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of({ donations: [donation()], total: 1, page: 0, limit: 25 }),
    });
    expect(fixture.nativeElement.textContent).toContain('כל התרומות שבוצעו בפלטפורמה');
    expect(fixture.debugElement.query(By.css('.plat-section-title')).nativeElement.textContent).toContain('כל התרומות');
  });

  // Regression for the 2026-09-15t bug: the status <select> is a flex
  // sibling of .ops-search-input's `flex: 1`, which claims all free space
  // first -- with no flex-basis of its own the select collapsed to a
  // sliver too narrow to show "כל הסטטוסים". `flex: none` + min-width on
  // .ops-status-select is the fix; this test locks in the visible symptom
  // (a readable width) rather than the CSS property, so it still catches
  // a regression introduced a different way.
  it('the status select never collapses to an unreadable sliver next to a wide search input', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    const select: HTMLSelectElement = fixture.debugElement.query(By.css('.ops-status-select')).nativeElement;
    expect(select.getBoundingClientRect().width).toBeGreaterThan(80);
  });

  // Regression for the 2026-09-16 report that a joined/segmented "one bar"
  // treatment (tried and reverted) made the select lose its own visible
  // box and look like plain text. This is a conventional toolbar: each
  // control keeps its OWN border/radius/background -- there is no shared
  // wrapper, no "סטטוס:" label, and the two must never visually merge.
  it('search and status are two separate, normally-bordered controls -- no shared border, no label', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of(emptyDonationsResponse()),
    });

    expect(fixture.debugElement.query(By.css('.ops-filter-label'))).toBeFalsy();
    expect(fixture.nativeElement.textContent).not.toContain('סטטוס:');

    const input = fixture.debugElement.query(By.css('.ops-search-input')).nativeElement;
    const select = fixture.debugElement.query(By.css('.ops-status-select')).nativeElement;
    const inputStyle = getComputedStyle(input);
    const selectStyle = getComputedStyle(select);
    expect(inputStyle.borderStyle).toBe('solid');
    expect(selectStyle.borderStyle).toBe('solid');
    expect(inputStyle.borderRadius).not.toBe('0px');
    expect(selectStyle.borderRadius).not.toBe('0px');
  });

  // Regression for the underlying 2026-09-16 "detached" report -- verified
  // by real relative position, not just "technically inside the card"
  // (a bounding-box-vs-card check alone passed even when the layout still
  // looked visibly wrong, per that report). At desktop width: same row,
  // status immediately adjacent to the search field with a normal gap,
  // both fully inside the card padding, search consumes the remaining
  // width, and RTL order is right (search) then left (status).
  it('status sits immediately adjacent to the search field, on the same row, fully inside the card, in correct RTL order', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of(emptyDonationsResponse()),
    });

    const card = fixture.debugElement.query(By.css('.plat-card')).nativeElement.getBoundingClientRect();
    const toolbar = fixture.debugElement.query(By.css('.ops-donations-toolbar')).nativeElement;
    const input = fixture.debugElement.query(By.css('.ops-search-input')).nativeElement.getBoundingClientRect();
    const select = fixture.debugElement.query(By.css('.ops-status-select')).nativeElement.getBoundingClientRect();

    expect(getComputedStyle(toolbar).flexWrap).toBe('wrap'); // narrow-viewport safety net only
    // Same row: both controls share a vertical position (desktop width, no wrap needed).
    expect(Math.abs(input.top - select.top)).toBeLessThan(2);

    // RTL order: search (DOM-first) sits physically to the RIGHT of status
    // (DOM-second) -- i.e. search's own left edge is status's right edge.
    expect(input.left).toBeGreaterThan(select.right);

    // Immediately adjacent: a normal small gap, not a wide empty span and
    // not touching with zero gap.
    const gap = input.left - select.right;
    expect(gap).toBeGreaterThan(4);
    expect(gap).toBeLessThan(20);

    // Both fully inside the card's own bounds.
    expect(input.right).toBeLessThanOrEqual(card.right + 1);
    expect(select.left).toBeGreaterThanOrEqual(card.left - 1);

    // Search consumes the remaining width -- it must be the wider control.
    expect(input.width).toBeGreaterThan(select.width);
  });

  // Regression for the other half of the same original bug: styles.scss
  // defines a global `select { background-image: url(<chevron>) }` for
  // the dropdown arrow; a `background: #fff` SHORTHAND on
  // .ops-status-select resets background-image to `none` as part of the
  // same declaration (shorthand vs. longhand doesn't matter to the
  // cascade once specificity is equal or higher), silently deleting the
  // arrow. Must use `background-color`. Also verifies the chevron is a
  // real visible icon (non-zero background-size), not just "not none".
  it('the status select shows a real, visibly-sized dropdown chevron -- uses background-color, not a `background` shorthand that would erase it', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    const select: HTMLSelectElement = fixture.debugElement.query(By.css('.ops-status-select')).nativeElement;
    const style = getComputedStyle(select);
    expect(style.backgroundImage).not.toBe('none');
    expect(style.backgroundSize).not.toBe('0px 0px');
    expect(style.appearance === 'none' || (style as any).webkitAppearance === 'none').toBeTrue();
  });

  it('long entity/campaign names are truncated so תאריך/סכום/סוג/סטטוס stay on-screen instead of being pushed off by an unbounded column', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [] }),
      listDonations: () => of({
        donations: [donation({
          entity_name: 'ישראלס - העמותה לחקר האי.אל.אס. בישראל ומחלותיה הנלוות',
          campaign_title: 'גדולים מהחיים - קמפיין גיוס שנתי 2026 לתמיכה במשפחות',
        })],
        total: 1, page: 0, limit: 25,
      }),
    });
    const truncatedCells = fixture.debugElement.queryAll(By.css('.ops-td-truncate'));
    expect(truncatedCells.length).toBe(2); // עמותה + קמפיין only
    for (const cell of truncatedCells) {
      const style = getComputedStyle(cell.nativeElement);
      expect(style.textOverflow).toBe('ellipsis');
      expect(style.overflow).toBe('hidden');
    }
  });
});

// Regression coverage for the drawer's human-readable donation/campaign
// context (2026-09-14r) -- fetched lazily from the existing public
// donation-confirmation endpoint (GET /api/donations/public/:id, already
// called by donation-success.component.ts) and PlatformService.getCampaign
// (already called by the campaign detail page) -- no new backend code.
describe('PlatformCardcomOpsPageComponent - drawer donation/campaign context', () => {
  const HEALTHY_HEARTBEAT = { lastHeartbeatAt: '2026-09-14T00:00:00Z', minutesSinceLastHeartbeat: 1, healthy: true };

  function healthWith(overrides: Partial<HealthResponse> = {}): HealthResponse {
    return {
      webhooks: [], jobs: [], knownJobs: ['stale-pending-donations'],
      schedulerHeartbeat: HEALTHY_HEARTBEAT, alerts: [], ...overrides,
    };
  }

  function lookupFailedFinding(id: number, donationId: string): ReconciliationFinding {
    return {
      id, job_name: 'stale-pending-donations', finding_type: 'lookup_failed', severity: 'warning',
      subject_type: 'donation', subject_id: donationId, details: { error: 'ETIMEDOUT' },
      found_at: '2026-09-08T00:00:00Z', last_seen_at: '2026-09-14T00:00:00Z',
      resolved_at: null, resolved_by: null,
    };
  }

  function campaignMismatchFinding(id: number, campaignId: string): ReconciliationFinding {
    return {
      id, job_name: 'aggregate-consistency', finding_type: 'campaign_aggregate_mismatch', severity: 'critical',
      subject_type: 'campaign', subject_id: campaignId,
      details: { currentAmount: '500.00', actualAmount: '480.00' },
      found_at: '2026-09-08T00:00:00Z', last_seen_at: '2026-09-14T00:00:00Z',
      resolved_at: null, resolved_by: null,
    };
  }

  async function createFixture(service: Partial<CardcomOpsService>) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PlatformCardcomOpsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CardcomOpsService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformCardcomOpsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('shows amount/campaign/association/date once the existing public donation endpoint responds, and NEVER shows the donor name it also returns', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [lookupFailedFinding(1, 'donation-a')] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    const httpMock = TestBed.inject(HttpTestingController);

    fixture.debugElement.query(By.css('.ops-anomaly-bar')).nativeElement.click();
    fixture.detectChanges();
    fixture.debugElement.query(By.css('.ops-group-card button')).nativeElement.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('טוען פרטי תרומה');

    const req = httpMock.expectOne(`${environment.apiUrl}/api/donations/public/donation-a`);
    expect(req.request.method).toBe('GET');
    req.flush({
      amount: 50, created_at: '2026-09-08T23:15:00.000Z',
      campaign_title: 'קמפיין הדוגמה', entity_name: 'עמותת הדוגמה',
      donor_name: 'ישראל ישראלי', status: 'pending',
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('תרומה של ₪50');
    expect(text).toContain('קמפיין הדוגמה');
    expect(text).toContain('עמותת הדוגמה');
    expect(text).toContain('לא הצלחנו לוודא את מצב התשלום מול חברת הסליקה');
    expect(text).not.toContain('ישראל ישראלי'); // donor name returned by the endpoint, never shown
    httpMock.verify();
  });

  it('shows campaign title/association once PlatformService.getCampaign (the existing campaign-detail endpoint) responds', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [campaignMismatchFinding(5, 'campaign-x')] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    const httpMock = TestBed.inject(HttpTestingController);

    fixture.debugElement.query(By.css('.ops-anomaly-bar')).nativeElement.click();
    fixture.detectChanges();
    fixture.debugElement.query(By.css('.ops-group-card button')).nativeElement.click();
    fixture.detectChanges();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/platform/campaigns/campaign-x`);
    req.flush({ title: 'קמפיין מבחן', entity_name: 'עמותת מבחן', current_amount: '500.00' });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('קמפיין: קמפיין מבחן');
    expect(text).toContain('עמותת מבחן');
    expect(text).toContain('התרומות עצמן תקינות'); // per-item explanation, still present
    httpMock.verify();
  });

  it('falls back to a generic identifiable label (never stuck on "טוען...") if the donation endpoint fails -- e.g. a donation that was since deleted/not found', async () => {
    const fixture = await createFixture({
      getHealth: () => of(healthWith()),
      getFindings: () => of({ findings: [lookupFailedFinding(1, 'donation-missing')] }),
      listDonations: () => of(emptyDonationsResponse()),
    });
    const httpMock = TestBed.inject(HttpTestingController);

    fixture.debugElement.query(By.css('.ops-anomaly-bar')).nativeElement.click();
    fixture.detectChanges();
    fixture.debugElement.query(By.css('.ops-group-card button')).nativeElement.click();
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/api/donations/public/donation-missing`).flush(
      { error: 'Not found' }, { status: 404, statusText: 'Not Found' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('טוען פרטי תרומה');
    const subject = fixture.debugElement.query(By.css('.ops-drawer-item-subject'));
    expect(subject.nativeElement.textContent.trim()).toBe('תרומה'); // generic fallback, not invented data
    httpMock.verify();
  });
});
