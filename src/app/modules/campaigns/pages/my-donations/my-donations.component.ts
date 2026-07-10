import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DonationService, MyDonation } from '../../services/donation.service';

@Component({
  selector: 'app-my-donations',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-donations.component.html',
  styleUrl: './my-donations.component.css',
})
export class MyDonationsComponent implements OnInit {
  private donationService = inject(DonationService);
  private router = inject(Router);

  donations: MyDonation[] = [];
  loading = true;
  error: string | null = null;

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
