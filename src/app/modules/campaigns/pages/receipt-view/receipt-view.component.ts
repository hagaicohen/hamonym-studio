import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, Meta, SafeResourceUrl, Title } from '@angular/platform-browser';
import { DonationService } from '../../services/donation.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

@Component({
  selector: 'app-receipt-view', standalone: true, imports: [CommonModule, RouterLink],
  templateUrl: './receipt-view.component.html',
  styles: ['.official-receipt {max-width:960px;margin:auto;padding:20px;} iframe {display:block;width:100%;height:75dvh;border:0;margin:16px 0;} a,button {display:inline-block;margin:8px;}'],
})
export class ReceiptViewComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private donations = inject(DonationService);
  private sanitizer = inject(DomSanitizer);
  private meta = inject(Meta);
  private title = inject(Title);
  private loader = inject(AppLoaderService);
  private request?: { unsubscribe(): void };
  pdfUrl: SafeResourceUrl | null = null;
  downloadUrl = '';
  loading = false;
  loginRequired = false;
  get returnUrl(): string { return '/receipts/' + this.route.snapshot.paramMap.get('id'); }
  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow' });
    this.meta.updateTag({ name: 'referrer', content: 'no-referrer' });
    this.title.setTitle('קבלה רשמית — המונים');
    this.loader.hide(); this.load();
  }
  load(): void {
    if (this.loading) return;
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.loading = true;
    this.request = this.donations.getReceiptPdf(id).subscribe({
      next: blob => {
        if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
        this.downloadUrl = URL.createObjectURL(blob);
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.downloadUrl);
        this.loading = false;
      },
      error: error => { this.loading = false; this.loginRequired = error.status === 401 || error.status === 403; },
    });
  }
  ngOnDestroy(): void {
    this.request?.unsubscribe();
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
  }
}
