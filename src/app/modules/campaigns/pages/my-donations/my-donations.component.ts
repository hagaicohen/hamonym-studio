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

  donations: MyDonation[] = [];
  loading = true;
  error: string | null = null;

  // Recurring instructions — Personal Area, read-only phase (Pause/Resume/
  // Cancel land in a later phase, deliberately not here yet).
  recurringInstructions: MyRecurringInstruction[] = [];
  recurringLoading = true;
  recurringError: string | null = null;

  expandedInstructionId: string | null = null;
  historyByInstruction: Record<string, RecurringCharge[]> = {};
  historyLoading: Record<string, boolean> = {};

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

    this.recurringService.getMyRecurring().subscribe({
      next: (instructions) => {
        this.recurringInstructions = instructions;
        this.recurringLoading = false;
      },
      error: (err) => {
        // A 401 here is already handled by the donations call above (same
        // token, same redirect) — no need to duplicate that logic.
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
