import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BillingOpsService,
  BillingPeriod,
  BillingRun,
  StatementListItem,
  StatementDetail,
  BlockedMasavStatement,
  ActionableMasavStatement,
} from '../../services/billing-ops.service';

type Tab = 'periods' | 'statements' | 'masav';

const STATEMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  approved: 'מאושר',
  abandoned: 'בוטל (טיוטה)',
  open: 'בגבייה',
  paid: 'שולם',
  cancelled: 'מבוטל',
  written_off: 'נמחק כחוב אבוד',
};

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין',
  succeeded: 'הצליח',
  declined: 'נדחה',
  technical_failure: 'תקלה טכנית',
  ambiguous: 'לא ודאי',
};

const BLOCKED_REASON_LABELS: Record<string, string> = {
  masav_not_configured: 'אין פרטי בנק מוגדרים',
  masav_incomplete: 'פרטי בנק חסרים',
  masav_not_authorized: 'לא אושרה הרשאה',
};

@Component({
  selector: 'app-platform-billing-ops-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-billing-ops-page.component.html',
  styleUrl: './platform-billing-ops-page.component.css',
})
export class PlatformBillingOpsPageComponent implements OnInit {
  private service = inject(BillingOpsService);

  tab: Tab = 'periods';

  // ---- periods & calculation -------------------------------------------
  periods: BillingPeriod[] = [];
  periodsLoading = true;
  periodsError: string | null = null;
  newPeriodStart = '';
  newPeriodEnd = '';
  newPeriodStartDate = '';
  newPeriodStartTime = '00:00';
  newPeriodEndDate = '';
  newPeriodEndTime = '00:00';
  creatingPeriod = false;
  periodActionError: string | null = null;

  runs: BillingRun[] = [];
  runsLoading = false;
  calculatingPeriodId: string | null = null;
  calcAsOf = '';
  calcAsOfDate = '';
  calcAsOfTime = '';

  // ---- statements ---------------------------------------------------
  statements: StatementListItem[] = [];
  statementsLoading = true;
  statementsError: string | null = null;
  filterPeriodId = '';
  filterStatus = '';

  selectedStatement: StatementDetail | null = null;
  statementDetailLoading = false;
  statementActionBusy = false;
  statementActionError: string | null = null;

  // ---- masav ----------------------------------------------------------
  blockedStatements: BlockedMasavStatement[] = [];
  actionableStatements: ActionableMasavStatement[] = [];
  masavLoading = true;
  masavError: string | null = null;

  configuringEntityId: string | null = null;
  masavBankCode = '';
  masavBranchCode = '';
  masavAccountNumber = '';
  masavAccountHolderName = '';
  masavFormBusy = false;
  masavFormError: string | null = null;

  selectedExportStatementIds = new Set<string>();
  exporting = false;
  exportError: string | null = null;

  ngOnInit(): void {
    this.loadPeriods();
    this.loadStatements();
    this.loadMasav();
  }

  setTab(tab: Tab): void {
    this.tab = tab;
  }

  // ---- periods & calculation -------------------------------------------

  private loadPeriods(): void {
    this.periodsLoading = true;
    this.periodsError = null;
    this.service.listPeriods().subscribe({
      next: (res) => {
        this.periods = res.periods;
        this.periodsLoading = false;
      },
      error: () => {
        this.periodsError = 'שגיאה בטעינת תקופות חיוב';
        this.periodsLoading = false;
      },
    });
    this.loadRuns();
  }

  private loadRuns(): void {
    this.runsLoading = true;
    this.service.listRuns().subscribe({
      next: (res) => { this.runs = res.runs; this.runsLoading = false; },
      error: () => { this.runsLoading = false; },
    });
  }

  private combineDateTime(date: string, time: string): string {
    if (!date) return '';
    return `${date}T${time || '00:00'}`;
  }

  updateNewPeriodStart(): void {
    this.newPeriodStart = this.combineDateTime(this.newPeriodStartDate, this.newPeriodStartTime);
  }

  updateNewPeriodEnd(): void {
    this.newPeriodEnd = this.combineDateTime(this.newPeriodEndDate, this.newPeriodEndTime);
  }

  updateCalcAsOf(): void {
    this.calcAsOf = this.combineDateTime(this.calcAsOfDate, this.calcAsOfTime);
  }

  createPeriod(): void {
    if (this.creatingPeriod || !this.newPeriodStart || !this.newPeriodEnd) return;
    this.creatingPeriod = true;
    this.periodActionError = null;
    this.service.createPeriod(this.newPeriodStart, this.newPeriodEnd).subscribe({
      next: () => {
        this.creatingPeriod = false;
        this.newPeriodStart = '';
        this.newPeriodEnd = '';
        this.newPeriodStartDate = '';
        this.newPeriodStartTime = '00:00';
        this.newPeriodEndDate = '';
        this.newPeriodEndTime = '00:00';
        this.loadPeriods();
      },
      error: (err) => {
        this.creatingPeriod = false;
        this.periodActionError = err?.error?.error || 'יצירת התקופה נכשלה';
      },
    });
  }

  calculatePeriod(period: BillingPeriod): void {
    if (this.calculatingPeriodId) return;
    this.calculatingPeriodId = period.id;
    this.periodActionError = null;
    this.service.calculatePeriod(period.id, this.calcAsOf || undefined).subscribe({
      next: () => {
        this.calculatingPeriodId = null;
        this.loadPeriods();
        this.loadStatements();
      },
      error: (err) => {
        this.calculatingPeriodId = null;
        this.periodActionError = err?.error?.error || 'הרצת החישוב נכשלה';
      },
    });
  }

  runsForPeriod(periodId: string): BillingRun[] {
    return this.runs.filter((r) => r.billing_period_id === periodId);
  }

  // ---- statements -----------------------------------------------------

  loadStatements(): void {
    this.statementsLoading = true;
    this.statementsError = null;
    this.service.listStatements({ periodId: this.filterPeriodId || undefined, status: this.filterStatus || undefined }).subscribe({
      next: (res) => {
        this.statements = res.statements;
        this.statementsLoading = false;
      },
      error: () => {
        this.statementsError = 'שגיאה בטעינת Statements';
        this.statementsLoading = false;
      },
    });
  }

  openStatement(statement: StatementListItem): void {
    this.statementDetailLoading = true;
    this.statementActionError = null;
    this.selectedStatement = null;
    this.service.getStatement(statement.id).subscribe({
      next: (res) => {
        this.selectedStatement = res.statement;
        this.statementDetailLoading = false;
      },
      error: () => {
        this.statementDetailLoading = false;
        this.statementActionError = 'שגיאה בטעינת פרטי ה-Statement';
      },
    });
  }

  closeStatement(): void {
    this.selectedStatement = null;
  }

  private refreshSelectedStatement(): void {
    if (!this.selectedStatement) return;
    const id = this.selectedStatement.id;
    this.service.getStatement(id).subscribe({ next: (res) => { this.selectedStatement = res.statement; } });
    this.loadStatements();
  }

  approveStatement(): void {
    if (!this.selectedStatement || this.statementActionBusy) return;
    this.statementActionBusy = true;
    this.statementActionError = null;
    this.service.approveStatement(this.selectedStatement.id).subscribe({
      next: () => { this.statementActionBusy = false; this.refreshSelectedStatement(); },
      error: (err) => { this.statementActionBusy = false; this.statementActionError = err?.error?.error || 'האישור נכשל'; },
    });
  }

  abandonStatement(): void {
    if (!this.selectedStatement || this.statementActionBusy) return;
    this.statementActionBusy = true;
    this.statementActionError = null;
    this.service.abandonStatement(this.selectedStatement.id).subscribe({
      next: () => { this.statementActionBusy = false; this.refreshSelectedStatement(); },
      error: (err) => { this.statementActionBusy = false; this.statementActionError = err?.error?.error || 'הביטול נכשל'; },
    });
  }

  triggerCollection(): void {
    if (!this.selectedStatement || this.statementActionBusy) return;
    this.statementActionBusy = true;
    this.statementActionError = null;
    this.service.triggerCollection(this.selectedStatement.id).subscribe({
      next: (res) => {
        this.statementActionBusy = false;
        if (res.result?.skipped) {
          this.statementActionError = `הפעולה לא ביצעה גבייה: ${res.result.reason}`;
        }
        this.refreshSelectedStatement();
      },
      error: (err) => { this.statementActionBusy = false; this.statementActionError = err?.error?.error || 'הפעלת הגבייה נכשלה'; },
    });
  }

  statementStatusLabel(status: string): string {
    return STATEMENT_STATUS_LABELS[status] ?? status;
  }

  attemptStatusLabel(status: string | null): string {
    if (!status) return '—';
    return ATTEMPT_STATUS_LABELS[status] ?? status;
  }

  routedMethodLabel(method: string): string {
    if (method === 'card') return 'כרטיס אשראי';
    if (method === 'masav') return 'מס״ב';
    return 'חסום';
  }

  // ---- masav ------------------------------------------------------------

  loadMasav(): void {
    this.masavLoading = true;
    this.masavError = null;
    this.service.listBlockedMasavStatements().subscribe({
      next: (res) => { this.blockedStatements = res.statements; this.masavLoading = false; },
      error: () => { this.masavError = 'שגיאה בטעינת Statements חסומים'; this.masavLoading = false; },
    });
    this.service.listActionableMasavStatements().subscribe({
      next: (res) => { this.actionableStatements = res.statements; },
      error: () => {},
    });
  }

  blockedReasonLabel(reason: string): string {
    return BLOCKED_REASON_LABELS[reason] ?? reason;
  }

  openConfigureForm(entityId: string): void {
    this.configuringEntityId = entityId;
    this.masavBankCode = '';
    this.masavBranchCode = '';
    this.masavAccountNumber = '';
    this.masavAccountHolderName = '';
    this.masavFormError = null;
  }

  cancelConfigureForm(): void {
    this.configuringEntityId = null;
  }

  submitMasavConfig(): void {
    if (!this.configuringEntityId || this.masavFormBusy) return;
    if (!this.masavBankCode || !this.masavBranchCode || !this.masavAccountNumber) {
      this.masavFormError = 'יש למלא בנק, סניף ומספר חשבון';
      return;
    }
    this.masavFormBusy = true;
    this.masavFormError = null;
    this.service
      .upsertMasavConfig(this.configuringEntityId, {
        bankCode: this.masavBankCode,
        branchCode: this.masavBranchCode,
        accountNumber: this.masavAccountNumber,
        accountHolderName: this.masavAccountHolderName || undefined,
      })
      .subscribe({
        next: () => {
          this.masavFormBusy = false;
          this.configuringEntityId = null;
          this.loadMasav();
        },
        error: (err) => {
          this.masavFormBusy = false;
          this.masavFormError = err?.error?.error || 'שמירת פרטי הבנק נכשלה';
        },
      });
  }

  authorizeEntity(entityId: string): void {
    this.masavFormBusy = true;
    this.masavFormError = null;
    this.service.authorizeMasav(entityId).subscribe({
      next: () => { this.masavFormBusy = false; this.loadMasav(); },
      error: (err) => { this.masavFormBusy = false; this.masavError = err?.error?.error || 'אישור ההרשאה נכשל'; },
    });
  }

  revokeEntity(entityId: string): void {
    this.masavFormBusy = true;
    this.masavError = null;
    this.service.revokeMasav(entityId).subscribe({
      next: () => { this.masavFormBusy = false; this.loadMasav(); },
      error: (err) => { this.masavFormBusy = false; this.masavError = err?.error?.error || 'ביטול ההרשאה נכשל'; },
    });
  }

  openMasavAttempt(statementId: string): void {
    this.masavError = null;
    this.service.openMasavAttempt(statementId).subscribe({
      next: () => this.loadMasav(),
      error: (err) => { this.masavError = err?.error?.error || 'פתיחת ניסיון הגבייה נכשלה'; },
    });
  }

  toggleExportSelection(statementId: string): void {
    if (this.selectedExportStatementIds.has(statementId)) this.selectedExportStatementIds.delete(statementId);
    else this.selectedExportStatementIds.add(statementId);
  }

  isSelectedForExport(statementId: string): boolean {
    return this.selectedExportStatementIds.has(statementId);
  }

  exportSelected(): void {
    if (this.exporting || this.selectedExportStatementIds.size === 0) return;
    this.exporting = true;
    this.exportError = null;
    this.service.exportMasavExcel([...this.selectedExportStatementIds]).subscribe({
      next: (blob) => {
        this.exporting = false;
        this.downloadExcel(blob);
      },
      error: (err) => {
        this.exporting = false;
        this.exportError = err?.error?.error || 'הפקת קובץ הייצוא נכשלה';
      },
    });
  }

  // v1 stops here: once the operator downloads this file, submission to
  // MASAV, collection, and the result are all handled manually outside
  // Hamonym -- there is no further in-app action on this attempt.
  private downloadExcel(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masav-export-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
}
