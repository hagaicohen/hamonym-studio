import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-payment-failed-popup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-failed-popup.component.html',
  styleUrls: ['./payment-failed-popup.component.css'],
})
export class PaymentFailedPopupComponent {
  @Output() retry  = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}
