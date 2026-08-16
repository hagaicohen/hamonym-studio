import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CardcomOpsService,
  HealthResponse,
  JobRun,
  ReconciliationFinding,
} from '../../services/cardcom-ops.service';

const JOB_LABELS: Record<string, string> = {
  'webhook-recovery': 'שחזור Webhooks',
  'stale-pending-donations': 'תרומות תקועות',
  'aggregate-consistency': 'עקביות נתונים',
  'stuck-recurring-signups': 'הוראות קבע תקועות',
};

// Approved production schedule (docs/CARDCOM_OPERATIONAL_PROCESSES.md Part
// י') — display-only, not read from the API (health/jobs endpoints don't
// expose the cron expression). Purely informational context next to each
// job's status; the scheduler itself stays off until ENABLE_JOB_SCHEDULER
// is flipped in a real deploy, unrelated to this page.
const JOB_FREQUENCY_LABELS: Record<string, string> = {
  'webhook-recovery': 'כל 15 דקות',
  'stale-pending-donations': 'כל שעה',
  'stuck-recurring-signups': 'כל שעה',
  'aggregate-consistency': 'פעם ביום',
};

const FINDING_TYPE_LABELS: Record<string, string> = {
  lost_webhook_paid: 'תרומה שולמה אך Webhook לא התקבל',
  lookup_failed: 'בדיקה מול CardCom נכשלה',
  campaign_aggregate_mismatch: 'אי-התאמה בנתוני קמפיין',
  stuck_recurring_signup: 'הוראת קבע תקועה',
};

const WEBHOOK_TYPE_LABELS: Record<string, string> = {
  LowProfile: 'תרומה חד-פעמית',
  // Seen directly via this page's real data: one row from 2026-08-10 with
  // RecordType='Payment' — Cardcom's own "Test Webhook" button in the
  // terminal admin panel, not a real donation event. Labeled so it doesn't
  // show as a raw unlabeled string, not because it's expected traffic.
  Payment: 'בדיקת Webhook (CardCom)',
  MasterRecurring: 'הוראת קבע (סטטוס)',
  DetailRecurring: 'הוראת קבע (חיוב)',
  Document: 'מסמך',
};

@Component({
  selector: 'app-platform-cardcom-ops-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-cardcom-ops-page.component.html',
  styleUrl: './platform-cardcom-ops-page.component.css',
})
export class PlatformCardcomOpsPageComponent implements OnInit {
  private cardcomOps = inject(CardcomOpsService);

  loading = true;
  error: string | null = null;

  health: HealthResponse | null = null;
  findings: ReconciliationFinding[] = [];
  showResolved = false;

  runsByJob: Record<string, JobRun[]> = {};
  expandedJob: string | null = null;
  runningJob: string | null = null;
  resolvingFindingId: number | null = null;
  actionError: string | null = null;

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.loading = true;
    this.error = null;

    this.cardcomOps.getHealth().subscribe({
      next: (health) => {
        this.health = health;
        this.loading = false;
      },
      error: () => {
        this.error = 'שגיאה בטעינת מצב המערכת';
        this.loading = false;
      },
    });

    this.loadFindings();
  }

  private loadFindings(): void {
    this.cardcomOps.getFindings(this.showResolved).subscribe({
      next: (res) => { this.findings = res.findings; },
      error: () => { /* health already surfaces the main error state; findings failing quietly is acceptable here */ },
    });
  }

  toggleResolved(): void {
    this.showResolved = !this.showResolved;
    this.loadFindings();
  }

  jobLabel(name: string): string {
    return JOB_LABELS[name] ?? name;
  }

  jobFrequency(name: string): string {
    return JOB_FREQUENCY_LABELS[name] ?? '';
  }

  findingTypeLabel(type: string): string {
    return FINDING_TYPE_LABELS[type] ?? type;
  }

  webhookTypeLabel(type: string): string {
    return WEBHOOK_TYPE_LABELS[type] ?? type;
  }

  lastRunFor(jobName: string) {
    return this.health?.jobs.find((j) => j.job_name === jobName) ?? null;
  }

  toggleRuns(jobName: string): void {
    if (this.expandedJob === jobName) {
      this.expandedJob = null;
      return;
    }
    this.expandedJob = jobName;
    if (this.runsByJob[jobName]) return;

    this.cardcomOps.getJobRuns(jobName).subscribe({
      next: (res) => { this.runsByJob[jobName] = res.runs; },
      error: () => { this.runsByJob[jobName] = []; },
    });
  }

  runNow(jobName: string): void {
    this.runningJob = jobName;
    this.actionError = null;
    this.cardcomOps.runJob(jobName).subscribe({
      next: () => {
        this.runningJob = null;
        delete this.runsByJob[jobName]; // force a fresh fetch next expand
        this.loadAll(); // re-fetch from the server — never guess the new status locally
      },
      error: (err) => {
        this.runningJob = null;
        this.actionError = err?.error?.error || 'הרצת ה-job נכשלה';
      },
    });
  }

  resolveFinding(finding: ReconciliationFinding): void {
    this.resolvingFindingId = finding.id;
    this.actionError = null;
    this.cardcomOps.resolveFinding(finding.id).subscribe({
      next: () => {
        this.resolvingFindingId = null;
        this.loadFindings();
      },
      error: (err) => {
        this.resolvingFindingId = null;
        this.actionError = err?.error?.error || 'סימון ה-finding ככשלון נכשל';
      },
    });
  }

  // These fields (started_at/finished_at/found_at/last_seen_at) are all
  // TIMESTAMPTZ, a real instant — not the DATE-column ambiguity found and
  // fixed elsewhere this session (docs/CARDCOM_OPERATIONAL_PROCESSES.md).
  // Local getters throughout (date AND time) so the two halves come from
  // the same clock — mixing a UTC-sliced date with local-time hours would
  // reintroduce exactly that class of bug.
  fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hh}:${mm}`;
  }

  fmtDuration(ms: number | null): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
