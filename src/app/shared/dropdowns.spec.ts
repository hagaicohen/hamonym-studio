import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true, imports: [FormsModule],
  template: `
  <section dir="rtl" style="width:360px">
    <select id="plain" [(ngModel)]="value" aria-label="סטטוס">
      <option value="">הכל</option><option value="paid">שולם</option><option value="failed" disabled>נכשל</option>
    </select>
    <select id="disabled" disabled aria-label="מושבת"><option>א</option></select>
    <select id="multi" multiple aria-label="רבים"><option>א</option></select>
    <div class="editor-toolbar"><select id="toolbar" aria-label="סוג בלוק"><option>א</option></select></div>
    <div style="--hm-select-accent: rgb(204, 53, 15)"><select id="themed" aria-label="מיון"><option selected>א</option></select></div>
  </section>`,
})
class DropdownFixture { value = 'paid'; }

describe('Shared dropdown panel', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<DropdownFixture>>;
  const el = (s: string) => fixture.nativeElement.querySelector(s) as HTMLElement;
  const supported = CSS.supports('appearance', 'base-select');
  beforeEach(async () => {
    fixture = TestBed.createComponent(DropdownFixture);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());

  it('keeps the bound value and the native control', () => {
    expect((el('#plain') as HTMLSelectElement).value).toBe('paid');
    (el('#plain') as HTMLSelectElement).value = '';
    el('#plain').dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.value).toBe('');
  });

  it('renders the HAMONYM panel with comfortable RTL options and a purple selected state', () => {
    if (!supported) { pending('customizable select not supported in this browser'); return; }
    expect(getComputedStyle(el('#plain')).appearance).toBe('base-select');
    const options = Array.from(el('#plain').querySelectorAll('option'));
    for (const o of options) {
      const cs = getComputedStyle(o);
      expect(parseFloat(cs.minHeight)).toBeGreaterThanOrEqual(40);
      expect(parseFloat(cs.minHeight)).toBeLessThanOrEqual(44);
      expect(cs.direction).toBe('rtl');
    }
    expect(getComputedStyle(options[1]).color).toBe('rgb(109, 40, 217)');
    expect(getComputedStyle(options[2]).color).toBe('rgb(100, 116, 139)');
    expect(getComputedStyle(options[2]).cursor).toBe('not-allowed');
  });

  it('keeps the shared closed-state size and disabled look', () => {
    expect(getComputedStyle(el('#plain')).height).toBe('48px');
    expect(el('#plain').getBoundingClientRect().width).toBeLessThanOrEqual(360);
    expect(getComputedStyle(el('#disabled')).backgroundColor).toBe('rgb(241, 245, 249)');
  });

  it('leaves multiselects and editor toolbars untouched', () => {
    expect(getComputedStyle(el('#multi')).appearance).not.toBe('base-select');
    expect(getComputedStyle(el('#toolbar')).appearance).not.toBe('base-select');
  });

  it('lets a page override the accent (campaign theme)', () => {
    if (!supported) { pending('customizable select not supported in this browser'); return; }
    expect(getComputedStyle(el('#themed').querySelector('option')!).color).toBe('rgb(204, 53, 15)');
  });
});
