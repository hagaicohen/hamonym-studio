import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, output, untracked } from '@angular/core';
import { CartStoreService } from './cart-store.service';
import { CartIconComponent } from './cart-icon.component';

/**
 * Cart trigger in the campaign header. v4.50: part of the header's template (CampaignCartService mounted it into
 * the header after each render, attached to the application). The page is rendered from its inputs and not
 * checked by the application, so the button renders its count itself when the cart changes.
 */
@Component({
  selector: 'ham-cart-header-button',
  standalone: true,
  imports: [CartIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
    <button type="button" class="ham-cart-header-button" data-ham-cart-trigger
      [class.has-items]="cart.count() > 0" [attr.aria-label]="label()" [attr.title]="title()" (click)="openCart.emit()">
      <ham-cart-icon /><span class="ham-cart-count" aria-live="polite">{{ cart.count() }}</span>
    </button>`
})
export class CartHeaderButtonComponent {
  readonly cart = inject(CartStoreService);
  readonly openCart = output<void>();
  readonly label = computed(() => 'סל קניות, ' + this.cart.count() + ' פריטים');
  readonly title = computed(() => 'סל קניות · ' + this.cart.count() + ' פריטים');
  private readonly cdr = inject(ChangeDetectorRef);
  constructor() {
    effect(() => { this.cart.count(); untracked(() => this.cdr.detectChanges()); });
  }
}
