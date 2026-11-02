import { OfficialReceiptActionComponent } from '../../shared/components/official-receipt-action/official-receipt-action.component';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DonationService, MyDonation } from '../../services/donation.service';
import {
  RecurringService,
  MyRecurringInstruction,
  RecurringCharge,
  recurringStatusLabel,
} from '../../services/recurring.service';
import { AuthService } from '../../../../core/services/auth.service';
import { TopbarComponent } from '../../../../core/layout/topbar/topbar.component';

@Component({
  selector: 'app-my-donations',
  standalone: true,
  imports: [OfficialReceiptActionComponent, CommonModule, FormsModule, RouterLink, TopbarComponent],
  templateUrl: './my-donations.component.html',
  styleUrl: './my-donations.component.css',
})
export class MyDonationsComponent implements OnInit {
  private donationService = inject(DonationService);
  private recurringService = inject(RecurringService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  verificationBusy = false;
  verificationMessage = '';

  requestVerification(): void {
    if (this.verificationBusy) return;
    this.verificationBusy = true;
    this.auth.requestDonationVerification().subscribe({
      next: () => { this.verificationBusy = false; this.verificationMessage = 'שלחנו קישור אימות לדוא״ל של החשבון. לאחר האימות יופיעו התרומות המשויכות.'; },
      error: error => {
        this.verificationBusy = false;
        this.verificationMessage = error.status === 429 ? 'יש להמתין דקה לפני שליחה נוספת.' : 'לא ניתן לשלוח דוא״ל אימות כרגע. נסו שוב מאוחר יותר.';
      },
    });
  }

  donationStatusLabel(status: string): string {
    return ({ paid: 'שולם', pending: 'ממתין', failed: 'נכשל' } as Record<string, string>)[status] || status;
  }

  get greetingFirstName(): string | null {
    const fullName = this.auth.currentUser()?.full_name?.trim();
    return fullName ? fullName.split(' ')[0] : null;
  }

  donations: MyDonation[] = [];
  search = '';
  statusFilter = '';
  sortField: 'date' | 'amount' | 'campaign' = 'date';
  sortDescending = true;
  page = 1;
  readonly pageSize = 10;
  get filteredDonations(): MyDonation[] {
    const query = this.search.trim().toLocaleLowerCase('he');
    const rows = this.donations.filter(d => (!this.statusFilter || d.status === this.statusFilter) &&
      (!query || `${d.campaign_title} ${d.entity_name} ${d.amount} ${d.note || ''}`.toLocaleLowerCase('he').includes(query)));
    return rows.sort((a, b) => {
      const diff = this.sortField === 'amount' ? Number(a.amount) - Number(b.amount)
        : this.sortField === 'campaign' ? a.campaign_title.localeCompare(b.campaign_title, 'he')
        : Date.parse(a.completed_at || a.created_at) - Date.parse(b.completed_at || b.created_at);
      return this.sortDescending ? -diff : diff;
    });
  }
  get pageCount(): number { return Math.max(1, Math.ceil(this.filteredDonations.length / this.pageSize)); }
  get visibleDonations(): MyDonation[] { return this.filteredDonations.slice((this.page - 1) * this.pageSize, this.page * this.pageSize); }
  sortBy(field: 'date' | 'amount' | 'campaign'): void {
    this.sortDescending = this.sortField === field ? !this.sortDescending : field !== 'campaign';
    this.sortField = field; this.page = 1;
  }
  sortIndicator(field: string): string { return this.sortField === field ? (this.sortDescending ? ' ↓' : ' ↑') : ''; }
  loading = true;
  error: string | null = null;

  recurringInstructions: MyRecurringInstruction[] = [];
  recurringLoading = true;
  recurringError: string | null = null;

  expandedInstructionId: string | null = null;
  historyByInstruction: Record<string, RecurringCharge[]> = {};
  historyLoading: Record<string, boolean> = {};

  // Pause/Resume/Cancel confirmation — one dialog, content driven by
  // `pendingAction`. Deliberately does NOT touch recurringInstructions on
  // submit; only a successful response (re-fetched from the server, never
  // guessed locally) is allowed to change what a donor sees as the current
  // status — see confirmAction() below.
  pendingAction: 'pause' | 'resume' | 'cancel' | null = null;
  actionTarget: MyRecurringInstruction | null = null;
  actionInFlight = false;
  actionError: string | null = null;

  get totalDonated(): number {
    return this.donations.filter(d => d.status === 'paid').reduce((sum, d) => sum + Number(d.amount), 0);
  }

  get campaignsSupported(): number {
    return new Set(this.donations.filter(d => d.status === 'paid').map((d) => d.campaign_slug)).size;
  }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('verification');
    if (token && !this.auth.getToken()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/my-donations?verification=' + encodeURIComponent(token) } });
      return;
    }
    const requestEmail = this.route.snapshot.queryParamMap.get('verifyEmail') === '1';
    if (token || requestEmail) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { verification: null, verifyEmail: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    if (token) {
      this.verificationBusy = true;
      this.auth.verifyDonationOwnership(token).subscribe({
        next: () => { this.verificationBusy = false; this.verificationMessage = 'הדוא״ל אומת והתרומות שויכו לחשבון.'; this.loadDonations(); this.loadRecurring(); },
        error: () => { this.verificationBusy = false; this.verificationMessage = 'קישור האימות אינו תקף או פג תוקפו. אפשר לבקש קישור חדש.'; this.loadDonations(); this.loadRecurring(); },
      });
      return;
    }
    this.loadDonations(); this.loadRecurring();
    if (requestEmail) this.requestVerification();
  }

  private loadDonations(): void {
    this.donationService.getMyDonations().subscribe({
      next: (donations) => {
        this.donations = donations;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.status === 401 ? null : 'שגיאה בטעינת התרומות';
        this.loading = false;
        if (err.status === 401) {
          localStorage.removeItem('token');
          this.router.navigate(['/login']);
        }
      },
    });

  }

  private loadRecurring(): void {
    this.recurringService.getMyRecurring().subscribe({
      next: (instructions) => {
        this.recurringInstructions = instructions;
        this.recurringLoading = false;
      },
      error: (err) => {
        // A 401 here is already handled by the donations call in ngOnInit
        // (same token, same redirect) — no need to duplicate that logic.
        this.recurringError = err.status === 401 ? null : 'שגיאה בטעינת הוראות הקבע';
        this.recurringLoading = false;
      },
    });
  }

  statusLabel(status: string): string {
    return recurringStatusLabel(status);
  }

  toggleHistory(instructionId: string): void {
    if (this.expandedInstructionId === instructionId) {
      this.expandedInstructionId = null;
      return;
    }
    this.expandedInstructionId = instructionId;
    if (this.historyByInstruction[instructionId]) return; // already loaded, no re-fetch

    this.historyLoading[instructionId] = true;
    this.recurringService.getHistory(instructionId).subscribe({
      next: (history) => {
        this.historyByInstruction[instructionId] = history;
        this.historyLoading[instructionId] = false;
      },
      error: () => {
        // Keep the invariant the template relies on (loading=false implies
        // historyByInstruction[id] is a real array, never undefined) — an
        // empty result here reads as "no charges yet", not as a crash.
        this.historyByInstruction[instructionId] = [];
        this.historyLoading[instructionId] = false;
      },
    });
  }

  openAction(action: 'pause' | 'resume' | 'cancel', instruction: MyRecurringInstruction): void {
    this.pendingAction = action;
    this.actionTarget = instruction;
    this.actionError = null;
  }

  closeAction(): void {
    if (this.actionInFlight) return; // don't let a stray click abandon an in-flight request
    this.pendingAction = null;
    this.actionTarget = null;
    this.actionError = null;
  }

  confirmAction(): void {
    if (!this.pendingAction || !this.actionTarget) return;
    const action = this.pendingAction;
    const instructionId = this.actionTarget.id;

    this.actionInFlight = true;
    this.actionError = null;

    const call$ =
      action === 'pause'  ? this.recurringService.pause(instructionId)
      : action === 'resume' ? this.recurringService.resume(instructionId)
      : this.recurringService.cancel(instructionId);

    call$.subscribe({
      next: () => {
        this.actionInFlight = false;
        this.pendingAction = null;
        this.actionTarget = null;
        // Re-fetch from the server rather than mutating recurringInstructions
        // locally — the new status is only ever what the server actually
        // wrote (after a real Cardcom success), never assumed from the
        // action that was requested.
        this.loadRecurring();
      },
      error: (err) => {
        this.actionInFlight = false;
        // Deliberately leave pendingAction/actionTarget/recurringInstructions
        // untouched — the dialog stays open showing the error, and the card
        // behind it still shows whatever status it had before this attempt.
        this.actionError = err?.error?.error || 'הפעולה נכשלה, נסו שוב';
      },
    });
  }

  fmtMoney(n: string | number): string {
    return '₪' + (Number(n) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
  }

  fmtDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }
}
