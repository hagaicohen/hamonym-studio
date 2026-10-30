import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';
import { BillingOpsService, BillingPeriod, MasavConfig, StatementListItem } from '../../services/billing-ops.service';
import { FinanceOpsService, MasavProposal, MasavExportPreview, MasavInstruction } from '../../services/finance-ops.service';
import { CollectionOpsService, JobActivity } from '../../services/collection-ops.service';
import { SimulationClockService } from '../../services/simulation-clock.service';
import { billingPeriodLabel } from '../../services/billing-period-label';

type WorkflowState = 'waiting' | 'authorization' | 'proposed' | 'approved' | 'exported' | 'partial' | 'failed' | 'completed' | 'blocked' | 'error';
interface MasavRow {
  statement: StatementListItem;
  period?: BillingPeriod;
  proposal?: MasavProposal;
  outstanding: number | null;
  state: WorkflowState;
  explanation: string;
}

@Component({
  selector: 'app-masav-collection-section',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './masav-collection-section.component.html',
  styleUrl: './masav-collection-section.component.css',
})
export class MasavCollectionSectionComponent implements OnInit {
  private billing = inject(BillingOpsService);
  private finance = inject(FinanceOpsService);
  private collection = inject(CollectionOpsService);
  private clock = inject(SimulationClockService);
  private destroyRef = inject(DestroyRef);
  @Output() changed = new EventEmitter<void>();
  rows: MasavRow[] = [];
  loading = false;
  error = '';
  actionError = '';
  busy = false;
  monthLabel = '';
  approvalId: string | null = null;
  approvalReason = '';
  preview: MasavExportPreview | null = null;
  previewBusy = false;
  resultInstruction = '';
  resultAmount = '';
  resultReference = '';
  resultConfirmedAt = '';
  resultConfirmed = false;
  resultMessage = '';
  instructions: MasavInstruction[] = [];
  resultAction: 'payment' | 'finalize' = 'payment';
  retryInstruction = '';
  readonly instructionLabels = { pending: 'ממתין לתוצאות', partial: 'גבייה חלקית', failed: 'גבייה נכשלה', completed: 'הגבייה הושלמה' };

  beginResult(instruction: MasavInstruction, action: 'payment' | 'finalize'): void {
    if (this.busy || this.loading || instruction.finalized) return;
    this.resultInstruction = instruction.id; this.resultAction = action;
    this.resultAmount = ''; this.resultReference = ''; this.resultConfirmedAt = ''; this.resultConfirmed = false;
    this.actionError = ''; this.resultMessage = ''; this.retryInstruction = '';
  }

  confirmRetry(): void {
    if (this.busy || this.loading || !this.instructions.some(i => i.id === this.retryInstruction && i.retry_eligible)) return;
    this.busy = true; this.actionError = '';
    this.finance.prepareMasavRetry(this.retryInstruction).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy = false; this.retryInstruction = ''; this.resultMessage = 'הוכנה הצעה חדשה ליתרה בלבד. נדרשים אישור וייצוא ידניים.'; this.refresh(); this.changed.emit(); },
      error: error => { this.busy = false; this.actionError = this.recoveryError(error); this.refresh(); },
    });
  }

  private recoveryError(error: any): string {
    const code = error?.error?.code;
    const messages: Record<string, string> = {
      MASAV_RESULTS_NOT_FINALIZED: 'יש לסיים את רישום התוצאות לפני הכנת גבייה חוזרת.',
      MASAV_INSTRUCTION_FINALIZED: 'תוצאות ההוראה כבר נסגרו. לא ניתן להוסיף לה תשלום.',
      MASAV_NO_RETRY_BALANCE: 'לא נותרה יתרה כשירה לגבייה חוזרת.',
      MASAV_RESULT_REFERENCE_CONFLICT: 'האסמכתה כבר שויכה לרישום אחר. יש לבדוק את הרישום הקיים.',
      MASAV_RESULT_EXCEEDS_OUTSTANDING: 'הסכום גדול מהיתרה הזמינה. יש לבדוק את התוצאות שכבר נרשמו.',
      MASAV_RETRY_BLOCKED_masav_not_authorized: 'נדרשת הרשאת מס״ב מאושרת לפני הכנה חוזרת.',
      MASAV_RETRY_BLOCKED_collection_held: 'קיימת חסימת גבייה לעמותה. יש לטפל בה לפני הכנה חוזרת.',
      MASAV_RETRY_BLOCKED_unresolved_collection_attempt: 'קיים ניסיון גבייה שטרם הוכרע. יש לברר את תוצאתו.',
    };
    return messages[code] ?? 'הפעולה לא הושלמה. יש לרענן ולבדוק את האסמכתה, ההרשאה והיתרות לפני ניסיון נוסף.';
  }

  recordResult(): void {
    if (this.busy || !this.resultConfirmed || (this.resultAction === 'payment' && !this.resultAmount) || !this.resultReference || !this.resultConfirmedAt) return;
    const time = new Date(this.resultConfirmedAt);
    if (!Number.isFinite(time.getTime())) { this.actionError = 'יש להזין מועד אישור תקין.'; return; }
    this.busy = true;
    this.actionError = '';
    if (this.resultAction === 'finalize') {
      this.finance.finalizeMasavInstruction(this.resultInstruction, {
        reference: this.resultReference, confirmedAt: time.toISOString(), confirmed: true,
      }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => { this.busy = false; this.resultInstruction = ''; this.resultMessage = 'תוצאות ההוראה נסגרו. היתרה שלא נגבתה נשארת פתוחה.'; this.refresh(); this.changed.emit(); },
        error: error => { this.busy = false; this.actionError = this.recoveryError(error); },
      });
      return;
    }
    this.finance.recordMasavResult(this.resultInstruction, {
      amount: this.resultAmount, reference: this.resultReference,
      confirmedAt: time.toISOString(), confirmed: true,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ result }) => {
        this.busy = false;
        this.resultInstruction = '';
        this.resultMessage = 'תוצאת הגבייה נשמרה. הסכום שויך לחובות הישנים תחילה: ' + result.allocations.map(a => `₪${a.amount}`).join(' + ');
        this.changed.emit();
        this.refresh();
      },
      error: error => { this.busy = false; this.actionError = this.recoveryError(error); },
    });
  }
  private requestId = 0;

  readonly labels: Record<WorkflowState, string> = {
    partial: 'גבייה חלקית — תוצאות סופיות', failed: 'גבייה נכשלה — תוצאות סופיות',
    waiting: 'ממתין להכנת הצעה', authorization: 'נדרשת השלמת פרטי מס״ב',
    proposed: 'ממתין לאישור הצעה', approved: 'מוכן להפקת Excel',
    exported: 'קובץ הופק — ממתין לתוצאות גבייה', completed: 'הגבייה הושלמה',
    blocked: 'ההכנה חסומה', error: 'לא ניתן לאמת את המצב',
  };

  ngOnInit(): void { this.refresh(); }
  get totalOutstanding(): number { return this.rows.reduce((sum, row) => sum + (row.outstanding ?? 0), 0); }
  get organizationCount(): number { return new Set(this.rows.filter(row => (row.outstanding ?? 0) > 0).map(row => row.statement.entity_id)).size; }
  get periodCount(): number { return new Set(this.rows.filter(row => (row.outstanding ?? 0) > 0).map(row => row.statement.billing_period_id)).size; }
  get approvedCount(): number { return this.rows.filter(row => row.state === 'approved').length; }
  get incomplete(): boolean { return this.rows.some(row => row.outstanding === null); }
  get requiresFollowUp(): boolean { return this.loading || !!this.error || this.rows.some(row => row.state !== 'completed') || this.instructions.some(i => !i.finalized || i.retry_eligible); }
  get summaryStatus(): string {
    if (this.incomplete) return 'חלק מהנתונים לא אומתו';
    if (this.instructions.some(i => !i.finalized)) return 'ממתין לרישום וסיום תוצאות הגבייה';
    if (this.instructions.some(i => i.retry_eligible)) return 'קיימת יתרה להכנת גבייה חוזרת';
    if (this.rows.some(row => ['authorization', 'blocked', 'error'].includes(row.state))) return 'נדרש טיפול להמשך התהליך';
    if (this.rows.some(row => row.state === 'waiting')) return 'ממתין להכנה אוטומטית';
    if (this.rows.some(row => row.state === 'proposed')) return 'ממתין לאישור ידני';
    if (this.rows.some(row => row.state === 'approved')) return 'קובץ מוכן להפקה ידנית';
    if (this.rows.some(row => row.state === 'exported')) return 'ממתין לתוצאות גבייה חיצונית';
    return this.rows.length ? 'הגבייה הושלמה לפי הנתונים המאומתים' : 'אין יתרות מס״ב פתוחות';
  }

  refresh(): void {
    if (this.busy || this.previewBusy) return;
    const id = ++this.requestId;
    this.loading = true;
    this.error = '';
    this.approvalId = null;
    this.preview = null;
    forkJoin({
      statements: this.billing.listStatements({}), proposals: this.finance.listMasavProposals(),
      periods: this.billing.listPeriods(), clock: this.clock.getStatus(), activity: this.collection.getSystemActivity(), instructions: this.finance.listMasavInstructions(),
    }).pipe(switchMap(data => {
      this.instructions = data.instructions.instructions;
      this.monthLabel = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', month: 'long', year: 'numeric' }).format(new Date(data.clock.businessNow));
      const proposals = [...data.proposals.proposals].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      const statements = [...new Map(data.statements.statements.map(statement => [statement.id, statement])).values()];
      const candidates = statements.filter(statement => ['approved', 'open'].includes(statement.status)
        || statement.status === 'paid' && statement.confirmed_collection_methods?.includes('masav'));
      const mandateByEntity = new Map<string, ReturnType<BillingOpsService['getMasavConfig']>>();
      const job = [...data.activity.automatic, ...data.activity.fin11Planned].find(item => item.name === 'fin11-masav-prepare');
      const reads = candidates.map(statement => {
        let mandate = mandateByEntity.get(statement.entity_id);
        if (!mandate) { mandate = this.billing.getMasavConfig(statement.entity_id).pipe(shareReplay(1)); mandateByEntity.set(statement.entity_id, mandate); }
        const own = proposals.filter(proposal => proposal.statement_id === statement.id);
        const proposal = own.find(item => item.status === 'exported' && !this.instructions.find(i => i.id === item.instruction_id)?.finalized)
          ?? own.find(item => ['proposed', 'approved'].includes(item.status)) ?? own.find(item => item.status === 'exported');
        const period = data.periods.periods.find(item => item.id === statement.billing_period_id);
        return forkJoin({ balance: this.finance.getStatementBalance(statement.id), mandate }).pipe(map(result => {
          const outstanding = result.balance.balance.outstanding;
          if (!Number.isFinite(outstanding)) throw new Error('Invalid balance');
          const row: MasavRow = { statement, period, proposal, outstanding: Math.max(0, outstanding), state: 'waiting', explanation: '' };
          this.classify(row, result.mandate.config, job, own[0]);
          return row;
        }), catchError(() => of<MasavRow>({ statement, period, proposal, outstanding: null, state: 'error', explanation: 'לא ניתן לאמת את היתרה או את הרשאת מס״ב. יש לרענן לפני ביצוע פעולה.' })));
      });
      return reads.length ? forkJoin(reads) : of<MasavRow[]>([]);
    }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => {
        if (id !== this.requestId) return;
        this.rows = rows.filter(row => row.outstanding === null || row.outstanding > 0 || row.state === 'completed');
        this.loading = false;
      },
      error: () => { if (id === this.requestId) { this.error = 'לא ניתן לטעון את נתוני מס״ב. המצב לא אומת; יש לנסות לרענן.'; this.loading = false; } },
    });
  }

  private classify(row: MasavRow, config: MasavConfig | null, job: JobActivity | undefined, latest: MasavProposal | undefined): void {
    const instruction = this.instructions.find(i => i.id === row.proposal?.instruction_id);
    if (row.proposal?.status === 'exported' && instruction?.finalized && ['partial', 'failed'].includes(instruction.status) && (row.outstanding ?? 0) > 0) {
      row.state = instruction.status as 'partial' | 'failed'; row.explanation = 'התוצאות סופיות. ניתן להכין הוראה חדשה ליתרה באזור הוראות הגבייה.'; return;
    }
    if (row.outstanding === 0 && row.statement.status === 'paid' && row.statement.confirmed_collection_methods?.includes('masav')) { row.state = 'completed'; return; }
    // Export is not a payment; even a subsequently revoked mandate must not invite another export.
    if (row.proposal?.status === 'exported') { row.state = 'exported'; row.explanation = 'הקובץ הופק להורדה. היתרה נשארת פתוחה עד קבלת תוצאות גבייה מאומתות.'; return; }
    if (!config?.authorized || !config.bank_code || !config.branch_code || !config.account_number) {
      row.state = 'authorization'; row.explanation = config?.authorized ? 'יש להשלים את פרטי חשבון הבנק.' : 'נדרשים פרטי בנק והרשאת מס״ב מאושרת.'; return;
    }
    if (['pending', 'ambiguous'].includes(row.statement.latest_attempt_status ?? '')) {
      row.state = 'blocked'; row.explanation = 'קיים ניסיון גבייה שטרם הוכרע. יש לברר את תוצאתו לפני המשך התהליך.'; return;
    }
    if (row.proposal && Number(row.proposal.proposed_amount) !== row.outstanding) {
      row.state = 'waiting'; row.explanation = 'היתרה השתנתה מאז הכנת ההצעה. נדרש רענון הצעה בתהליך ההכנה האוטומטי.'; return;
    }
    if (row.proposal?.status === 'proposed' || row.proposal?.status === 'approved') { row.state = row.proposal.status; return; }
    if (!job?.registered) { row.state = 'blocked'; row.explanation = 'משימת הכנת מס״ב אינה זמינה במערכת. יש לבדוק את פעילות המערכת לפני המשך התהליך.'; return; }
    if (job.status === 'running') { row.explanation = 'הכנת הצעות מס״ב מתבצעת כעת. ניתן לרענן את המצב לאחר סיום הריצה.'; return; }
    const results = job?.resultSummary?.['results'];
    const result = Array.isArray(results) ? results.find((item: { statementId?: string }) => item?.statementId === row.statement.id) : undefined;
    const reason: unknown = result?.reason;
    if (job?.status === 'failed' && reason) {
      // A pre-authorization failure is history, not a claim that the current approved mandate is invalid.
      row.explanation = ['masav_not_configured', 'masav_not_authorized', 'masav_incomplete'].includes(String(reason))
        ? 'ההכנה הקודמת נעצרה לפני השלמת ההרשאה. ההרשאה מאושרת כעת; ממתין להכנה חוזרת אוטומטית.'
        : this.failureReason(String(reason));
      if (!String(reason).startsWith('masav_')) row.state = 'blocked';
    } else if (job?.status === 'failed' && !Array.isArray(results)) {
      row.state = 'blocked'; row.explanation = 'ריצת ההכנה האחרונה נכשלה. יש לבדוק את פעילות המערכת ולרענן לאחר הטיפול.';
    } else {
      row.explanation = latest?.status === 'superseded' ? 'ההצעה הקודמת אינה בתוקף. ממתין להכנה חוזרת לפי היתרה העדכנית.'
        : 'הכנת ההצעה נעשית אוטומטית החל מה־6 בחודש שלאחר תקופת החיוב. ניתן לרענן את המצב ללא ביצוע גבייה.';
    }
  }

  private failureReason(reason: string): string {
    const reasons: Record<string, string> = {
      collection_held: 'קיימת חסימת גבייה פתוחה לעמותה. יש לטפל בחריגה לפני ההכנה.',
      unresolved_collection_attempt: 'קיים ניסיון גבייה שטרם הוכרע. יש לבדוק את פרטי החיוב.',
    };
    return reasons[reason] ?? 'הכנת ההצעה נחסמה: ' + reason.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
  }

  periodLabel(row: MasavRow): string { return row.period ? billingPeriodLabel(row.period) : 'תקופת החיוב אינה זמינה'; }
  money(amount: number): string { return amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  beginApproval(row: MasavRow): void { if (this.busy || this.loading || row.state !== 'proposed') return; this.approvalId = row.statement.id; this.approvalReason = ''; this.actionError = ''; }
  approve(row: MasavRow): void {
    if (this.busy || this.loading || row.state !== 'proposed' || !row.proposal || this.approvalId !== row.statement.id) return;
    if (!this.approvalReason.trim()) { this.actionError = 'יש להזין הערה לאישור ההצעה.'; return; }
    this.busy = true; this.actionError = '';
    this.finance.approveMasavProposal(row.proposal.id, this.approvalReason.trim()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ result }) => {
        this.busy = false;
        if (!result?.approved) this.actionError = 'ההצעה לא אושרה: המצב השתנה. הנתונים נטענו מחדש; יש לבדוק את היתרה וההרשאה.';
        this.refresh(); this.changed.emit();
      },
      error: () => { this.busy = false; this.actionError = 'אישור ההצעה לא אומת. יש לרענן את המצב לפני ניסיון נוסף.'; this.refresh(); },
    });
  }
  openExportPreview(): void {
    if (this.busy || this.loading || this.previewBusy || !this.approvedCount) return;
    this.previewBusy = true; this.actionError = ''; this.approvalId = null;
    this.finance.previewMasavExport().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ preview }) => { this.previewBusy = false; this.preview = preview; },
      error: () => { this.previewBusy = false; this.actionError = 'לא ניתן להכין תצוגה מקדימה. יש לוודא שגרסת השרת וסכמת הייצוא מעודכנות ושההרשאות בתוקף.'; },
    });
  }
  exportPreview(): void {
    if (this.busy || this.loading || this.previewBusy || !this.preview?.instructions.length) return;
    const ids = this.preview.instructions.flatMap(row => row.components.map(component => component.proposalId));
    this.busy = true; this.actionError = '';
    this.finance.exportMasavProposals(ids, this.preview.previewToken).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => { this.saveFile(blob); this.busy = false; this.refresh(); this.changed.emit(); },
      error: error => {
        this.busy = false;
        this.actionError = ['MASAV_PREVIEW_CHANGED', 'PROPOSAL_STALE_AT_EXPORT'].includes(error?.error?.code)
          ? 'היתרות או אופן האיחוד השתנו מאז הסקירה. יש להכין תצוגה מקדימה חדשה לפני ייצוא.'
          : 'לא התקבל קובץ Excel. יש לבדוק את המצב המעודכן לפני ניסיון נוסף; אין להסיק שבוצעה גבייה.';
        this.refresh();
      },
    });
  }
  componentPeriod(periodStart: string, periodEnd: string): string { return billingPeriodLabel({ period_start: periodStart, period_end: periodEnd }); }
  saveFile(blob: Blob): void {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `masav-instructions-${Date.now()}.xlsx`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
