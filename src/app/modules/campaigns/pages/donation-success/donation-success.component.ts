import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { DonationService } from '../../services/donation.service';

interface DonationResult {
  id:             string;
  amount:         number;
  created_at:     string;
  status:         string;
  donor_name:     string | null;
  has_account:    boolean;
  campaign_id:    string;
  campaign_title: string;
  campaign_slug:  string;
  cover_image_url: string | null;
  entity_name:    string;
  entity_logo:    string | null;
  entity_ga_measurement_id: string | null;
  receipt_id:     string | null;
}

@Component({
  selector: 'app-donation-success',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './donation-success.component.html',
  styleUrls: ['./donation-success.component.css'],
})
export class DonationSuccessComponent implements OnInit, OnDestroy {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private meta   = inject(Meta);
  private title  = inject(Title);
  private http   = inject(HttpClient);
  private loader = inject(AppLoaderService);
  private analytics = inject(AnalyticsService);
  private donationService = inject(DonationService);

  // Quiet background status/receipt refresh (2026-09-27) — the donor already
  // sees "תודה רבה!" the instant this page loads, regardless of
  // donations.status (CardCom's HandleSubmit succeeding is not the same as
  // the webhook/GetLpResult pipeline having finished writing 'paid' yet —
  // see checkout-v2.component.ts's submitOpenFieldsPayment() doc comment).
  // This never blocks or delays the thank-you message; it only quietly
  // fills in the receipt link once one exists. Bounded so an donation that
  // genuinely never finalizes (abandoned webhook) doesn't poll forever.
  private statusPollTimer: ReturnType<typeof setTimeout> | null = null;
  private statusPollAttempts = 0;
  private readonly STATUS_POLL_INTERVAL_MS = 3000;
  private readonly STATUS_POLL_MAX_ATTEMPTS = 20; // ~60s of quiet, invisible retrying

  slug       = '';
  ref        = '';
  amount     = 0;
  donation: DonationResult | null = null;
  loading    = true;
  linkCopied = false;

  ngOnInit(): void {
    // Checkout V2 Step 3 (2026-09-26) — CardCom's own hosted checkout runs
    // inside an <iframe>; its SuccessRedirectUrl chain (CardCom → our own
    // /api/donations/return → here) ends up loading this same page INSIDE
    // that iframe once the redirect lands back on our own origin. Rendering
    // the full success page inside a small payment iframe would look
    // broken, so instead: signal the parent window (which already knows
    // its own donationId/amount — this carries no data of its own) and
    // stop here. window.top !== window.self is the standard "am I framed"
    // check; window.parent.postMessage is only reachable once same-origin,
    // which this page always is by the time CardCom's redirect chain
    // reaches it. Purely a navigation signal — the webhook remains the
    // only thing that ever writes donations.status='paid' (see
    // handleReturn's own doc comment in donations.service.js).
    if (window.top !== window.self) {
      window.parent.postMessage({ source: 'hamonym-donation-return', status: 'success' }, window.location.origin);
      return;
    }

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

            this.analytics.init(d.entity_ga_measurement_id);
            this.analytics.trackEvent('donation_completed', {
              value:         this.amount,
              currency:      'ILS',
              campaign_name: d.campaign_title,
              campaign_id:   d.campaign_id,
              transaction_id: d.id,
            });

            if (d.status !== 'paid') this.scheduleQuietStatusPoll();
          },
          error: () => { this.loading = false; this.loader.hide(); },
        });
    } else {
      this.loading = false;
      this.loader.hide();
    }
  }

  ngOnDestroy(): void {
    if (this.statusPollTimer) clearTimeout(this.statusPollTimer);
  }

  private scheduleQuietStatusPoll(): void {
    this.statusPollTimer = setTimeout(() => this.pollQuietStatus(), this.STATUS_POLL_INTERVAL_MS);
  }

  private pollQuietStatus(): void {
    if (!this.ref) return;
    this.donationService.getStatus(this.ref).subscribe({
      next: (res) => {
        if (this.donation) this.donation = { ...this.donation, status: res.status, receipt_id: res.receipt_id };
        if (res.status === 'paid') return; // done -- receipt_id is written in the same transaction as 'paid'
        this.statusPollAttempts++;
        if (this.statusPollAttempts < this.STATUS_POLL_MAX_ATTEMPTS) this.scheduleQuietStatusPoll();
        // else: quietly give up -- the donor already saw "תודה רבה!" long
        // ago; the receipt-by-email fallback message covers this case (see
        // the template).
      },
      error: () => {
        this.statusPollAttempts++;
        if (this.statusPollAttempts < this.STATUS_POLL_MAX_ATTEMPTS) this.scheduleQuietStatusPoll();
      },
    });
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
  // they donated, or a matching account already existed). has_account is a
  // boolean the backend computes from donor_user_id -- this public,
  // unauthenticated endpoint must never return the internal id itself
  // (2026-09-10, Launch Closure).
  get showCreateAccountPrompt(): boolean {
    return !localStorage.getItem('token') && !this.donation?.has_account;
  }

  // Email is deliberately NOT pre-filled here (2026-09-10, Launch Closure)
  // -- doing so would require the public success response to expose the
  // donor's email indefinitely to anyone holding the URL, not just the
  // donor themselves right after paying. The donor types it once on the
  // registration form instead; donor_name alone isn't sensitive the same
  // way and is already shown in plaintext elsewhere on this same page.
  get createAccountQueryParams(): Record<string, string> {
    const params: Record<string, string> = { returnUrl: '/my-donations' };
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
