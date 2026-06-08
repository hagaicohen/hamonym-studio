import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampaignDraft, CampaignReward } from '../../../services/campaign-studio-state.service';
import { DonationService } from '../../../services/donation.service';

@Component({
  selector: 'app-checkout-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './checkout-modal.component.html',
  styleUrls: ['./checkout-modal.component.css'],
})
export class CheckoutModalComponent implements OnInit {
  @Input() draft!: CampaignDraft;
  @Input() amount = 0;
  @Input() cartRewards: CampaignReward[] = [];
  @Input() entityLogoUrl: string | null = null;
  @Input() entityName = '';

  @Output() closed = new EventEmitter<void>();

  private donationService = inject(DonationService);

  name      = '';
  email     = '';
  phone     = '';
  address   = '';
  idNumber  = '';
  submitted = false;
  loading   = false;
  errorMsg  = '';

  get formattedAmount(): string {
    return '₪' + this.amount.toLocaleString('he-IL');
  }

  get isValid(): boolean {
    return this.name.trim().length > 1
      && this.isValidEmail
      && this.phone.trim().length >= 9
      && this.address.trim().length > 2
      && this.isValidId;
  }

  get isValidId(): boolean {
    const digits = this.idNumber.replace(/\D/g, '').padStart(9, '0');
    if (digits.length !== 9) return false;
    let total = 0;
    for (let i = 0; i < 9; i++) {
      let n = parseInt(digits[i]) * ((i % 2) + 1);
      if (n > 9) n -= 9;
      total += n;
    }
    return total % 10 === 0;
  }

  get isValidEmail(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
  }

  close(): void {
    document.body.style.overflow = '';
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('checkout-overlay')) {
      this.close();
    }
  }

  onSubmit(): void {
    this.submitted = true;
    if (!this.isValid || this.loading) return;

    if (!this.draft?.id) {
      this.errorMsg = 'לא ניתן לעבד תשלום — הקמפיין אינו פעיל';
      return;
    }

    this.loading  = true;
    this.errorMsg = '';

    const rewards = this.cartRewards.map(r => ({
      title:         r.title,
      minimumAmount: r.minimumAmount ?? 0,
    }));

    this.donationService.create({
      campaignId: this.draft.id,
      donor: {
        name:     this.name.trim(),
        email:    this.email.trim(),
        phone:    this.phone.trim(),
        idNumber: this.idNumber.replace(/\D/g, ''),
        address:  this.address.trim(),
      },
      amount: this.amount,
      rewards,
    }).subscribe({
      next: (res) => {
        document.body.style.overflow = '';
        window.location.href = res.url;
      },
      error: (err) => {
        this.loading  = false;
        this.errorMsg = err?.error?.error || 'שגיאה בעיבוד הבקשה, נסו שנית';
      },
    });
  }
}
