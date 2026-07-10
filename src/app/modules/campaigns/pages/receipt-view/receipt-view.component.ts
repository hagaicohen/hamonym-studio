import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { DonationService, Receipt } from '../../services/donation.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

@Component({
  selector: 'app-receipt-view',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './receipt-view.component.html',
  styleUrl: './receipt-view.component.css',
})
export class ReceiptViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private donationService = inject(DonationService);
  private loader = inject(AppLoaderService);
  private meta = inject(Meta);
  private title = inject(Title);

  receipt: Receipt | null = null;
  loading = true;
  notFound = false;

  ngOnInit(): void {
    this.meta.addTag({ name: 'robots', content: 'noindex,nofollow' });

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound = true;
      this.loading = false;
      this.loader.hide();
      return;
    }

    this.donationService.getReceipt(id).subscribe({
      next: (r) => {
        this.receipt = r;
        this.title.setTitle(`קבלה מספר ${r.receipt_number} — ${r.entity_name}`);
        this.loading = false;
        this.loader.hide();
      },
      error: () => {
        this.notFound = true;
        this.loading = false;
        this.loader.hide();
      },
    });
  }

  get formattedAmount(): string {
    return '₪' + Math.round(Number(this.receipt?.amount) || 0).toLocaleString('he-IL');
  }

  get formattedDate(): string {
    const iso = this.receipt?.issued_at;
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  print(): void {
    window.print();
  }
}
