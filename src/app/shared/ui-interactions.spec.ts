import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MoneyInputDirective } from './directives/money-input.directive';

@Component({
  standalone: true,
  imports: [FormsModule, MoneyInputDirective],
  template: `
    <input type="text" appMoneyInput [(ngModel)]="amount" [disabled]="disabled" min="-5000" max="100000" #money="ngModel">
    <section class="alerts-list" dir="rtl"><div class="alert-row alert-row-warning">
      <div class="alert-main"><div class="alert-text">
        <span class="alert-title">התראה עם תיאור ארוך שצריך להישאר קריא גם בטלפון נייד</span>
        <span class="alert-desc">פרטים נוספים על הקמפיין והפעולה הנדרשת</span>
      </div></div><button class="alert-action-btn alert-btn-warning">לפרטים</button>
    </div></section>
    <button class="disabled-test" disabled>מושבת</button><a href="#details">פרטים</a>
  `,
  styleUrls: ['../modules/dashboard/pages/dashboard/dashboard.component.css'],
})
class InteractionFixture {
  amount: number | null = null;
  disabled = false;
}

describe('Money entry and shared interaction affordances', () => {
  async function render() {
    TestBed.configureTestingModule({ imports: [InteractionFixture] });
    const fixture = TestBed.createComponent(InteractionFixture);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    async function enter(value: string) {
      input.value = value; input.setSelectionRange(value.length, value.length);
      input.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    }
    return { fixture, input, enter };
  }

  it('groups while typing and retains a numeric model, including cents and credits', async () => {
    const { fixture, input, enter } = await render();
    for (const [text, display, number] of [['12345', '12,345', 12345], ['1234.50', '1,234.50', 1234.5], ['-1234.50', '-1,234.50', -1234.5]] as const) {
      await enter(text); expect(input.value).toBe(display); expect(fixture.componentInstance.amount).toBe(number);
    }
  });

  it('handles pasted grouped currency, zero and clearing', async () => {
    const { fixture, input, enter } = await render();
    await enter('₪ 2,500.25'); expect(fixture.componentInstance.amount).toBe(2500.25); expect(input.value).toBe('2,500.25');
    await enter('0'); expect(fixture.componentInstance.amount).toBe(0);
    await enter(''); expect(fixture.componentInstance.amount).toBeNull(); expect(input.value).toBe('');
  });

  it('preserves a decimal in progress and rejects malformed pasted amounts', async () => {
    const { fixture, input, enter } = await render();
    await enter('1000.'); expect(input.value).toBe('1,000.');
    await enter('1.2.3'); expect(input.value).toBe('1,000.'); expect(fixture.componentInstance.amount).toBe(1000);
  });

  it('keeps the caret at the edited digit when grouping changes', async () => {
    const { input, enter } = await render(); await enter('12345');
    input.value = '129,345'; input.setSelectionRange(3, 3); input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('129,345'); expect(input.selectionStart).toBe(3);
  });

  it('formats programmatic values and respects disabled and min/max states', async () => {
    const { fixture, input, enter } = await render();
    fixture.componentInstance.amount = 12500.75; fixture.detectChanges(); await fixture.whenStable();
    expect(input.value).toBe('12,500.75');
    await enter('-6000'); fixture.detectChanges(); expect(input.classList.contains('ng-invalid')).toBeTrue();
    await enter('100001'); fixture.detectChanges(); expect(input.classList.contains('ng-invalid')).toBeTrue();
    fixture.componentInstance.disabled = true; fixture.detectChanges(); await fixture.whenStable(); expect(input.disabled).toBeTrue();
  });

  it('shows pointer cursors only for enabled actions', async () => {
    const { fixture } = await render();
    expect(getComputedStyle(fixture.nativeElement.querySelector('.alert-action-btn')).cursor).toBe('pointer');
    expect(getComputedStyle(fixture.nativeElement.querySelector('a')).cursor).toBe('pointer');
    expect(getComputedStyle(fixture.nativeElement.querySelector('.disabled-test')).cursor).not.toBe('pointer');
  });

  it('keeps long alerts within the viewport and gives mobile actions a touch target', async () => {
    const { fixture } = await render();
    const row = fixture.nativeElement.querySelector('.alert-row') as HTMLElement;
    const button = fixture.nativeElement.querySelector('.alert-action-btn') as HTMLElement;
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
    expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    if (window.innerWidth <= 768) expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });
});
