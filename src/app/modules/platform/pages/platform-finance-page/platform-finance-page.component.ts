import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  FinanceOpsService,
  PaymentException,
  PaymentExceptionAction,
  MasavProposal,
  ResolutionType,
} from '../../services/finance-ops.service';

type Tab = 'exceptions' | 'masav';
type ExceptionFilter = 'all' | 'open' | 'resolved';
type MasavFilter = 'all' | 'proposed' | 'approved' | 'exported';

// FIN-11 Super Admin Finance screen -- review/act on the two surfaces that
// have no UI yet (overpayment exceptions, MASAV proposals). Deliberately
// does NOT re-list Statements/balances per entity on its own -- that is
// "חיובי עמותות" (platform-billing-ops-page)'s existing job; this page
// links to it instead of duplicating its query. Every action here wraps an
// already-tested backend function (Stage 2B/3) -- no financial calculation
// happens in this component, only display and the same confirm-before-post
// pattern platform-billing-ops-page already established.
@Component({
  selector: 'app-platform-finance-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './platform-finance-page.component.html',
  styleUrl: './platform-finance-page.component.css',
})
export class PlatformFinancePageComponent implements OnInit {
  private service = inject(FinanceOpsService);

  tab: Tab = 'exceptions';
  setTab(t: Tab): void {
    this.tab = t;
  }

  // --- Exceptions -----------------------------------------------------
  exceptions: PaymentException[] = [];
  exceptionsLoading = true;
  exceptionsError: string | null = null;
  exceptionFilter: ExceptionFilter = 'open';

  selectedException: PaymentException | null = null;
  exceptionActions: PaymentExceptionAction[] = [];
  exceptionActionsLoading = false;

  overrideReason = '';
  overrideBusy = false;
  overrideError: string | null = null;

  resolutionType: ResolutionType = 'resolve_no_overpayment';
  resolveReason = '';
  resolveEvidenceNotes = '';
  resolveBusy = false;
  resolveError: string | null = null;

  // --- MASAV proposals --------------------------------------------------
  proposals: MasavProposal[] = [];
  proposalsLoading = true;
  proposalsError: string | null = null;
  masavFilter: MasavFilter = 'proposed';

  approveReasonByProposal: Record<string, string> = {};
  approveBusyByProposal: Record<string, boolean> = {};
  approveErrorByProposal: Record<string, string | null> = {};

  selectedProposalIds = new Set<string>();
  exportBusy = false;
  exportError: string | null = null;
  exportResult: { exported?: number } | null = null;

  ngOnInit(): void {
    this.loadExceptions();
    this.loadProposals();
  }

  // --- Exceptions logic --------------------------------------------------
  setExceptionFilter(f: ExceptionFilter): void {
    this.exceptionFilter = f;
    this.loadExceptions();
  }

  loadExceptions(): void {
    this.exceptionsLoading = true;
    this.exceptionsError = null;
    const status = this.exceptionFilter === 'all' ? undefined : this.exceptionFilter;
    this.service.listExceptions(status).subscribe({
      next: (res) => {
        this.exceptions = res.exceptions;
        this.exceptionsLoading = false;
      },
      error: () => {
        this.exceptionsLoading = false;
        this.exceptionsError = 'שגיאה בטעינת חריגי גביית-יתר';
      },
    });
  }

  selectException(exc: PaymentException): void {
    this.selectedException = exc;
    this.overrideReason = '';
    this.overrideError = null;
    this.resolveReason = '';
    this.resolveEvidenceNotes = '';
    this.resolveError = null;
    this.resolutionType = 'resolve_no_overpayment';
    this.exceptionActions = [];
    this.exceptionActionsLoading = true;
    this.service.getExceptionActions(exc.id).subscribe({
      next: (res) => {
        this.exceptionActions = res.actions;
        this.exceptionActionsLoading = false;
      },
      error: () => {
        this.exceptionActionsLoading = false;
      },
    });
  }

  closeExceptionPanel(): void {
    this.selectedException = null;
  }

  overrideHold(): void {
    if (!this.selectedException || this.overrideBusy) return;
    const reason = this.overrideReason.trim();
    if (!reason) {
      this.overrideError = 'נדרשת הערה המסבירה למה בטוח לבטל את ההגבלה';
      return;
    }
    if (!window.confirm('לבטל את ההגבלה על גבייה חדשה מהעמותה הזו? החריג עצמו יישאר פתוח עד שיוכרע.')) return;

    this.overrideBusy = true;
    this.overrideError = null;
    this.service.overrideExceptionHold(this.selectedException.id, reason).subscribe({
      next: () => {
        this.overrideBusy = false;
        this.overrideReason = '';
        this.loadExceptions();
        if (this.selectedException) this.selectException(this.selectedException);
      },
      error: (err) => {
        this.overrideBusy = false;
        this.overrideError = err?.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  resolveException(): void {
    if (!this.selectedException || this.resolveBusy) return;
    const reason = this.resolveReason.trim();
    if (!reason) {
      this.resolveError = 'נדרשת הערה המסבירה את ההחלטה';
      return;
    }
    const label = this.resolutionLabel(this.resolutionType);
    if (!window.confirm(`לתעד את ההחלטה "${label}" עבור החריג הזה? זו תיעוד החלטה בלבד — שום החזר/זיכוי לא מבוצע אוטומטית על ידי המערכת. הפעולה לא ניתנת לביטול.`)) return;

    this.resolveBusy = true;
    this.resolveError = null;
    this.service.resolveException(this.selectedException.id, this.resolutionType, reason, this.resolveEvidenceNotes.trim() || undefined).subscribe({
      next: () => {
        this.resolveBusy = false;
        this.resolveReason = '';
        this.resolveEvidenceNotes = '';
        this.loadExceptions();
        this.closeExceptionPanel();
      },
      error: (err) => {
        this.resolveBusy = false;
        this.resolveError = err?.error?.error || 'הפעולה נכשלה';
      },
    });
  }

  resolutionLabel(t: ResolutionType): string {
    switch (t) {
      case 'resolve_refund': return 'יוחזר לתורם';
      case 'resolve_credit': return 'יזוכה לעמותה';
      case 'resolve_no_overpayment': return 'אינה גביית-יתר אמיתית';
    }
  }

  actionLabel(t: string): string {
    switch (t) {
      case 'override_hold': return 'ביטול הגבלה';
      case 'resolve_refund': return 'הוכרע: החזר לתורם';
      case 'resolve_credit': return 'הוכרע: זיכוי לעמותה';
      case 'resolve_no_overpayment': return 'הוכרע: לא גביית-יתר';
      default: return t;
    }
  }

  // --- MASAV proposals logic ----------------------------------------------
  setMasavFilter(f: MasavFilter): void {
    this.masavFilter = f;
    this.selectedProposalIds.clear();
    this.loadProposals();
  }

  loadProposals(): void {
    this.proposalsLoading = true;
    this.proposalsError = null;
    const status = this.masavFilter === 'all' ? undefined : this.masavFilter;
    this.service.listMasavProposals(status).subscribe({
      next: (res) => {
        this.proposals = res.proposals;
        this.proposalsLoading = false;
      },
      error: () => {
        this.proposalsLoading = false;
        this.proposalsError = 'שגיאה בטעינת הצעות מס״ב';
      },
    });
  }

  toggleProposalSelection(id: string): void {
    if (this.selectedProposalIds.has(id)) this.selectedProposalIds.delete(id);
    else this.selectedProposalIds.add(id);
  }

  approveProposal(p: MasavProposal): void {
    if (this.approveBusyByProposal[p.id]) return;
    const reason = (this.approveReasonByProposal[p.id] || '').trim();
    if (!reason) {
      this.approveErrorByProposal[p.id] = 'נדרשת הערה לאישור';
      return;
    }
    if (!window.confirm(`לאשר הצעת מס״ב בסך ₪${p.proposed_amount} עבור ${p.entity_name}? היתרה תיבדק מחדש ברגע האישור.`)) return;

    this.approveBusyByProposal[p.id] = true;
    this.approveErrorByProposal[p.id] = null;
    this.service.approveMasavProposal(p.id, reason).subscribe({
      next: () => {
        this.approveBusyByProposal[p.id] = false;
        delete this.approveReasonByProposal[p.id];
        this.loadProposals();
      },
      error: (err) => {
        this.approveBusyByProposal[p.id] = false;
        this.approveErrorByProposal[p.id] = err?.error?.error || 'האישור נכשל';
      },
    });
  }

  exportSelectedProposals(): void {
    if (this.exportBusy || this.selectedProposalIds.size === 0) return;
    const ids = Array.from(this.selectedProposalIds);
    if (!window.confirm(`לייצא ${ids.length} הצעות מס״ב לקובץ? הקובץ יוריד למחשב; שידור בפועל לבנק (Tranzila) הוא עדיין פעולה ידנית מחוץ למערכת. ההצעות יסומנו "שודרו" רק אם הקובץ נוצר בהצלחה.`)) return;

    this.exportBusy = true;
    this.exportError = null;
    this.exportResult = null;
    this.service.exportMasavProposals(ids).subscribe({
      next: (blob) => {
        this.exportBusy = false;
        this.downloadExcel(blob);
        this.exportResult = { exported: ids.length };
        this.selectedProposalIds.clear();
        this.loadProposals();
      },
      error: (err) => {
        this.exportBusy = false;
        // err.error is a Blob here (responseType:'blob' applies to error
        // bodies too) -- the real error JSON the backend sent is inside it,
        // not directly readable synchronously; fall back to a generic
        // message rather than showing "[object Blob]".
        this.exportError = 'הייצוא נכשל — ייתכן שהיתרה השתנתה מאז האישור, או שהעמותה אינה מורשית למס״ב יותר';
      },
    });
  }

  // v1 stops here, same boundary as the existing MASAV export (platform-
  // billing-ops-page): once the admin downloads this file, submission to
  // the bank, collection, and the result are all handled manually outside
  // Hamonym.
  private downloadExcel(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masav-proposals-export-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  fmtMoney(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}
