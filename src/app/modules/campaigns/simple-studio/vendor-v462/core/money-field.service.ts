import { Injectable } from '@angular/core';
import { formatAmount } from './campaign-format';
import { readAmount } from '../inspector/inspector-edits';
import { studioListen } from './studio-session';

/**
 * Shekel fields (`input[data-money]`) group their digits while typing and on blur, in every part of the Studio
 * (inspector, management, wizard, donation box). Moved from the core engine (v4.61). One capture listener, before any
 * field's own handler, as before: several templates set `data-money` through a binding, so a directive cannot match
 * them; the listener is the session's (removed when the Studio is unmounted).
 */
@Injectable({ providedIn: 'root' })
export class MoneyFieldService {
  private started = false;
  start(): void {
    if (this.started) return;
    this.started = true;
    studioListen(document, 'input', (e: Event) => this.onInput(e), true);
    studioListen(document, 'blur', (e: Event) => this.onBlur(e), true);
  }
  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement; if (!el.matches?.('input[data-money]')) return;
    const before = el.value, caret = el.selectionStart ?? before.length;
    const numericalBefore = before.slice(0, caret).replace(/[^0-9.]/g, '').length;
    const after = formatAmount(before); if (before === after) return;
    el.value = after;
    let offset = 0, seen = 0;
    while (offset < after.length && seen < numericalBefore) { if (/[0-9.]/.test(after[offset])) seen++; offset++; }
    try { el.setSelectionRange(offset, offset); } catch { /* not a text field */ }
  }
  private onBlur(e: Event): void {
    const el = e.target as HTMLInputElement; if (!el.matches?.('input[data-money]')) return;
    if (el.value) el.value = formatAmount(readAmount(el.value));
  }
}
