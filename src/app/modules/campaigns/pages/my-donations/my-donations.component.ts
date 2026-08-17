import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DonationService, MyDonation } from '../../services/donation.service';
import {
  RecurringService,
  MyRecurringInstruction,
  RecurringCharge,
  recurringStatusLabel,
} from '../../services/recurring.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-my-donations',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-donations.component.html',
  styleUrl: './my-donations.component.css',
})
export class MyDonationsComponent implements OnInit {
  private donationService = inject(DonationService);
  private recurringService = inject(RecurringService);
  private router = inject(Router);
  private auth = inject(AuthService);

  get greetingFirstName(): string | null {
    const fullName = this.auth.currentUser()?.full_name?.trim();
    return fullName ? fullName.split(' ')[0] : null;
  }

  donations: MyDonation[] = [];
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
    return this.donations.reduce((sum, d) => sum + Number(d.amount), 0);
  }

  get campaignsSupported(): number {
    return new Set(this.donations.map((d) => d.campaign_slug)).size;
  }

  ngOnInit(): void {
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

    this.loadRecurring();
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
    return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');
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
