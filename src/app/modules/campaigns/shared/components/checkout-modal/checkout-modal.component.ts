import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampaignDraft, CampaignReward } from '../../../services/campaign-studio-state.service';

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

  name      = '';
  email     = '';
  phone     = '';
  address   = '';
  idNumber  = '';
  submitted = false;

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
    const digits = this.idNumber.replace(/\D/g, '');
    return digits.length === 9;
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
    if (!this.isValid) return;
    // TODO: integrate with Cardcom payment gateway
    console.log('Checkout:', { name: this.name, email: this.email, phone: this.phone, address: this.address, idNumber: this.idNumber, amount: this.amount });
  }
}
