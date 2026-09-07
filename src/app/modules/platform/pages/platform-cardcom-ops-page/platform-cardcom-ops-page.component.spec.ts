import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PlatformCardcomOpsPageComponent } from './platform-cardcom-ops-page.component';
import { CardcomOpsService, HealthResponse, ReconciliationFinding } from '../../services/cardcom-ops.service';

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

  function stubService(overrides: { health?: HealthResponse; findings?: ReconciliationFinding[] } = {}) {
    const health: HealthResponse = overrides.health ?? {
      webhooks: [],
      jobs: [],
      knownJobs: REAL_JOB_NAMES.filter((n) => n !== 'masav-collection' && n !== 'collection-router' && n !== 'payment_verification_gate'),
      alerts: [],
    };
    return {
      getHealth: () => of(health),
      getFindings: () => of({ findings: overrides.findings ?? [] }),
      getJobRuns: () => of({ runs: [] }),
      runJob: () => of({}),
      resolveFinding: () => of({}),
    };
  }

  async function createComponent(service: Partial<CardcomOpsService>) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PlatformCardcomOpsPageComponent],
      providers: [{ provide: CardcomOpsService, useValue: service }],
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
