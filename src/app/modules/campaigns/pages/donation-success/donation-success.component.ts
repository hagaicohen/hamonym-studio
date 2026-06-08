import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

interface DonationResult {
  id:             string;
  amount:         number;
  created_at:     string;
  status:         string;
  campaign_title: string;
  campaign_slug:  string;
  cover_image_url: string | null;
  entity_name:    string;
  entity_logo:    string | null;
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
          },
          error: () => { this.loading = false; },
        });
    } else {
      this.loading = false;
    }
  }

  get formattedAmount(): string {
    return '₪' + this.amount.toLocaleString('he-IL');
  }

  get formattedDate(): string {
    const d = this.donation?.created_at ? new Date(this.donation.created_at) : new Date();
    return d.toLocaleString('he-IL', { dateStyle: 'long', timeStyle: 'short' });
  }

  get campaignTitle(): string {
    return this.donation?.campaign_title || '';
  }

  get campaignUrl(): string {
    return `${window.location.origin}/campaigns/${this.slug}/view`;
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
    this.router.navigate(['/campaigns', this.slug, 'view']);
  }
}
