import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { CartStoreService } from './cart-store.service';

/** Short status message shown after cart actions. */
@Component({
  selector: 'ham-cart-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `<div id="hamCartToast" class="ham-cart-toast" role="status" [class.show]="visible()">{{ text() }}</div>`
})
export class CartToastComponent {
  private readonly cart = inject(CartStoreService);
  readonly text = signal('');
  readonly visible = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const toast = this.cart.toast();
      if (!toast) return;
      this.text.set(toast.text);
      this.visible.set(true);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.visible.set(false), 2100);
    }, { allowSignalWrites: true });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }
}
