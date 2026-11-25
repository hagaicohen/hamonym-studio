import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, viewChild } from '@angular/core';
import { CartStoreService } from './cart-store.service';
import { CartRace, CartRaceType, formatCurrency } from './cart.types';

export type RaceQuickAction = 'add' | 'checkout';

/**
 * Compact race registration used where the editor's full multi-step
 * participant wizard is not available (standalone pages).
 */
@Component({
  selector: 'ham-race-quick-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
<dialog #dialog class="ham-cart-race-modal" (close)="onClose()">
  <form #form method="dialog" dir="rtl">
    <div class="ham-cart-race-head"><h2>הרשמה ל{{ race().title || 'מירוץ' }}</h2><button value="cancel" aria-label="סגירה" type="submit">×</button></div>
    <label>סוג הרשמה<select name="type">
      @for (o of options(); track $index) { <option [value]="$index">{{ o.title }} · {{ money(o.price) }}</option> }
    </select></label>
    <label>מספר משתתפים<input name="qty" type="number" inputmode="numeric" min="1" [attr.max]="maxQty()" value="1" required></label>
    <label>שם איש קשר<input name="contact" required minlength="2" placeholder="שם מלא"></label>
    <div class="ham-cart-race-actions"><button value="cancel" type="submit">ביטול</button><button value="add" type="submit">הוספה לסל</button><button value="checkout" type="submit">לתשלום עכשיו</button></div>
    <small>הדמיה בלבד · אין רישום אמיתי למירוץ.</small>
  </form>
</dialog>`
})
export class RaceQuickRegisterComponent implements AfterViewInit {
  private readonly cart = inject(CartStoreService);
  readonly race = input.required<CartRace>();
  readonly raceIndex = input.required<number>();
  readonly done = output<RaceQuickAction | 'cancel'>();
  readonly money = formatCurrency;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly form = viewChild.required<ElementRef<HTMLFormElement>>('form');

  readonly options = computed<CartRaceType[]>(() => {
    const r = this.race();
    const types = (r.useRegistrationTypes && Array.isArray(r.registrationTypes) ? r.registrationTypes : []).filter(x => x.title);
    return types.length ? types : [{ id: 'base', title: 'הרשמה רגילה', price: Number(r.price) || 0 }];
  });
  readonly maxQty = computed(() => Math.max(1, Number(this.race().maxPerOrder) || 99));

  ngAfterViewInit(): void { this.dialog().nativeElement.showModal(); }

  onClose(): void {
    const action = this.dialog().nativeElement.returnValue;
    if (action === 'add' || action === 'checkout') {
      const f = this.form().nativeElement.elements as HTMLFormControlsCollection & Record<'type' | 'qty' | 'contact', HTMLInputElement>;
      const option = this.options()[Number(f.type.value)];
      const qty = Math.min(99, Math.max(1, Number(f.qty.value) || 1));
      const person = f.contact.value.trim();
      if (person && option) {
        this.cart.addRace({
          raceIndex: this.raceIndex(), title: this.race().title, type: option.title, unitPrice: Number(option.price) || 0, qty,
          contact: { name: person }, participants: Array.from({ length: qty }, () => ({ fullName: person }))
        });
        this.done.emit(action);
        return;
      }
    }
    this.done.emit('cancel');
  }
}
