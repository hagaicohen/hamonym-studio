import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

interface DonationResult {
  id:             string;
  amount:         number;
  created_at:     string;
  status:         string;
  donor_name:     string | null;
  donor_email:    string | null;
  donor_user_id:  string | null;
  campaign_title: string;
  campaign_slug:  string;
  cover_image_url: string | null;
  entity_name:    string;
  entity_logo:    string | null;
  receipt_id:     string | null;
}

@Component({
  selector: 'app-donation-success',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './donation-success.component.html',
  styleUrls: ['./donation-success.component.css'],
})
export class DonationSuccessComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private meta   = inject(Meta);
  private title  = inject(Title);
  private http   = inject(HttpClient);
  private loader = inject(AppLoaderService);

  slug       = '';
  ref        = '';
  amount     = 0;
  donation: DonationResult | null = null;
  loading    = true;
  linkCopied = false;

  ngOnInit(): void {
    // Prevent indexing
    this.meta.addTag({ name: 'robots', content: 'noindex,nofollow' });

    this.slug   = this.route.snapshot.paramMap.get('slug') || '';
    this.ref    = this.route.snapshot.queryParamMap.get('ref')    || '';
    this.amount = parseFloat(this.route.snapshot.queryParamMap.get('amount') || '0');

    if (this.ref) {
      this.http.get<DonationResult>(`${environment.apiUrl}/api/donations/public/${this.ref}`)
        .subscribe({
          next: (d) => {
            this.donation = d;
            this.amount   = parseFloat(String(d.amount));
            this.title.setTitle(`תודה על תרומתך — ${d.campaign_title}`);
            this.loading  = false;
            this.loader.hide();
          },
          error: () => { this.loading = false; this.loader.hide(); },
        });
    } else {
      this.loading = false;
      this.loader.hide();
    }
  }

  get formattedAmount(): string {
    return '₪' + this.amount.toLocaleString('he-IL');
  }

  get formattedDate(): string {
    const iso = this.donation?.created_at ?? new Date().toISOString();
    const [y, m, d] = iso.slice(0, 10).split('-');
    const t = new Date(iso);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${hh}:${mm}`;
  }

  get campaignTitle(): string {
    return this.donation?.campaign_title || '';
  }

  get campaignUrl(): string {
    return `${window.location.origin}/campaigns/${this.slug}/view`;
  }

  get receiptUrl(): string | null {
    return this.donation?.receipt_id ? `/receipts/${this.donation.receipt_id}` : null;
  }

  // Don't pitch account creation if the donor is already logged in, or this
  // donation is already linked to an account (e.g. they were logged in when
  // they donated, or a matching account already existed).
  get showCreateAccountPrompt(): boolean {
    return !localStorage.getItem('token') && !this.donation?.donor_user_id;
  }

  get createAccountQueryParams(): Record<string, string> {
    const params: Record<string, string> = { returnUrl: '/my-donations' };
    if (this.donation?.donor_email) params['email'] = this.donation.donor_email;
    if (this.donation?.donor_name) params['name'] = this.donation.donor_name;
    return params;
  }

  shareWhatsApp(): void {
    const text = encodeURIComponent(`תמכתי ב-${this.campaignTitle}! הצטרפו גם אתם: ${this.campaignUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  shareFacebook(): void {
    const url = encodeURIComponent(this.campaignUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.campaignUrl).then(() => {
      this.linkCopied = true;
      setTimeout(() => this.linkCopied = false, 2000);
    });
  }

  backToCampaign(): void {
    this.router.navigate(['/campaigns', this.slug, 'view'], {
      queryParams: { since: new Date(Date.now() - 10 * 60_000).toISOString() },
    });
  }
}
