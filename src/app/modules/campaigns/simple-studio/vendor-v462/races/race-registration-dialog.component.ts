import { STUDIO_PUBLIC_ACTIONS } from '../../studio-public-actions';
import { CartStoreService } from '../cart/cart-store.service';
import { CampaignCartService } from '../cart/campaign-cart.service';
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Injector, ViewEncapsulation,
  afterNextRender, computed, inject, output, signal, viewChild
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { parseCsv, parseXlsx, rowsToParticipants } from './participant-import';

export interface RaceChoice { id: string; name: string; price: number; }
export interface Participant { id: number; name: string; birth: string; heat: string; shirt: string; }
interface SelectOption { value: string; label: string; }
type Step = 0 | 1 | 2;
type BuyerField = 'name' | 'phone' | 'email';

const SHIRT_OPTIONS: SelectOption[] = [{ value: '', label: 'ללא חולצה / לא נבחרה' }, ...['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(s => ({ value: s, label: s }))];
const STEP_SUBTITLE = ['הוספת משתתפים למירוץ', 'פרטי איש קשר', 'סיכום ותשלום'];
const STEP_NEXT = ['המשך לפרטי המזמין ←', 'המשך לסיכום ←', 'סיום תצוגה מקדימה ✓'];
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Multi-participant race registration (demo only: no charge, no real registration). */
@Component({
  selector: 'ham-race-registration-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './race-registration-dialog.component.css',
  template: `
<dialog #dialog class="ham-race-registration-dialog" dir="rtl" (close)="closed.emit()" (click)="onDialogClick($event)" (keydown)="onKeydown($event)">
  <div class="hrm-shell">
    <header class="hrm-head">
      <div class="hrm-head-copy"><h2>הרשמה למירוץ</h2><small class="hrm-sub">{{ subtitle[step()] }}</small></div>
      <button type="button" class="hrm-close" aria-label="סגירה" (click)="close()">✕</button>
    </header>

    <main class="hrm-body">
      @switch (step()) {
        @case (0) {
          <p class="hrm-lead">מוסיפים משתתף ושומרים. כל משתתף שנשמר מופיע בשורה אחת וניתן לערוך אותו.</p>
          <div class="hrm-rowlist">
            @for (r of records(); track r.id; let i = $index) {
              <div class="hrm-person-row">
                <div class="hrm-person-summary">
                  <strong>{{ i + 1 }}. {{ r.name }}</strong>
                  <small>{{ heatName(r.heat) || 'מקצה' }} {{ r.birth ? '· ' + r.birth : '' }}{{ r.shirt ? ' · חולצה ' + r.shirt : '' }}</small>
                </div>
                <button type="button" class="hrm-mini" title="עריכה" [attr.aria-label]="'עריכת ' + r.name" (click)="edit(r.id)">✎</button>
                <button type="button" class="hrm-mini hrm-delete" title="מחיקה" [attr.aria-label]="'מחיקת ' + r.name" (click)="remove(r.id)">♲</button>
              </div>
            }
          </div>

          @if (draft(); as d) {
            <section class="hrm-edit">
              <div class="hrm-edit-title">
                <span>{{ isExisting(d.id) ? 'עריכת משתתף' : 'משתתף חדש' }}</span>
                <button class="hrm-mini" type="button" aria-label="ביטול עריכה" (click)="cancelEdit()">✕</button>
              </div>
              <div class="hrm-field"><label>שם מלא *</label>
                <input #nameInput [value]="d.name" (input)="setDraft('name', $any($event.target).value)" placeholder="שם המשתתף" autocomplete="off">
              </div>
              <div class="hrm-grid">
                <div class="hrm-field"><label>תאריך לידה</label>
                  <div class="hrm-date">
                    <input #birthInput type="date" [value]="d.birth" (input)="setDraft('birth', $any($event.target).value)" aria-label="תאריך לידה">
                    <button type="button" class="hrm-calendar" aria-label="בחירת תאריך" (click)="openPicker(birthInput)">▦</button>
                  </div>
                </div>
                <ng-container *ngTemplateOutlet="select; context: { key: 'heat', label: 'מקצה', options: heatOptions(), value: d.heat }" />
              </div>
              <ng-container *ngTemplateOutlet="select; context: { key: 'shirt', label: 'מידת חולצה (אופציונלי)', options: shirtOptions, value: d.shirt }" />
              <div class="hrm-edit-actions">
                <button type="button" class="hrm-primary" (click)="saveDraft()">✓ שמור משתתף</button>
                <button type="button" class="hrm-ghost" (click)="cancelEdit()">ביטול</button>
              </div>
            </section>
          }

          <div class="hrm-addbar">
            <button type="button" class="hrm-linebtn" (click)="add()">＋ הוסף משתתף</button>
            <button type="button" class="hrm-linebtn" (click)="fileInput.click()">⇧ ייבוא מ־Excel</button>
            <button type="button" class="hrm-linebtn" (click)="downloadTemplate()">↓ תבנית Excel / CSV</button>
          </div>
          <input #fileInput type="file" class="hrm-upload-input" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" (change)="importFile(fileInput)">
          <p class="hrm-muted">Excel‏ (xlsx) או CSV. עמודות: שם, תאריך לידה, מקצה, מידת חולצה. הייבוא מעדכן את הרשימה לתצוגה ואינו יוצר הרשמה בשרת.</p>
          @if (notice()) { <p class="hrm-ok" role="status">{{ notice() }}</p> }
          @if (error()) { <p class="hrm-error" role="alert">{{ error() }}</p> }
        }
        @case (1) {
          <div class="hrm-contact">
            <h3>פרטי המזמין</h3>
            <p class="hrm-lead">אדם אחד יכול לרשום מספר משתתפים.</p>
            @for (f of buyerFields; track f.key) {
              <div class="hrm-field"><label>{{ f.label }}</label>
                <input #buyerInput [type]="f.type" [value]="buyer()[f.key]" [placeholder]="f.label" (input)="setBuyer(f.key, $any($event.target).value)">
              </div>
            }
          </div>
        }
        @case (2) {
          <h3>{{platform ? 'סיכום ההרשמה' : 'סיכום בתצוגה מקדימה'}}</h3>
          <div class="hrm-rowlist">
            @for (r of records(); track r.id) {
              <div class="hrm-person-row">
                <div class="hrm-person-summary"><strong>{{ r.name }}</strong><small>{{ heatName(r.heat) }}</small></div>
                <strong>₪{{ heatPrice(r.heat) }}</strong>
              </div>
            }
          </div>
          <div class="hrm-field"><label>תרומה נוספת (אופציונלי)</label>
            <input type="number" min="0" [value]="donation()" (input)="setDonation($any($event.target).value)">
          </div>
          <div class="hrm-total"><span>סך הכול</span><span>₪{{ total().toLocaleString('he-IL') }}</span></div>
          <p class="hrm-muted">{{platform ? 'ההרשמה תאושר לאחר אישור התשלום.' : 'תצוגה מקדימה · אין חיוב או הרשמה בשרת.'}}</p>
        }
      }
    </main>

    <footer class="hrm-footer">
      <button class="hrm-ghost" type="button" (click)="back()">{{ step() === 0 ? 'ביטול' : 'חזרה' }}</button>
      <button type="button" class="hrm-next" (click)="next()">{{ platform && step()===2 ? 'הוספה לסל והמשך לתשלום' : nextLabel[step()] }}</button>
    </footer>
  </div>
</dialog>

<ng-template #select let-key="key" let-label="label" let-options="options" let-value="value">
  <div class="hrm-field"><label>{{ label }}</label>
    <div class="hrm-select-wrap">
      <button type="button" class="hrm-select" aria-haspopup="listbox" [attr.aria-expanded]="openMenu() === key" (click)="toggleMenu(key)">
        <span>{{ optionLabel(options, value) }}</span>
        <svg class="hrm-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="hrm-menu" role="listbox" [hidden]="openMenu() !== key">
        @for (o of options; track o.value) {
          <button type="button" role="option" [attr.aria-selected]="o.value === (value || '')" (click)="choose(key, o.value)">{{ o.label }}</button>
        }
      </div>
    </div>
  </div>
</ng-template>`,
  imports: [NgTemplateOutlet]
})
export class RaceRegistrationDialogComponent implements AfterViewInit {
  private readonly injector = inject(Injector);
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly buyerInput = viewChild<ElementRef<HTMLInputElement>>('buyerInput');

  readonly platform=inject(STUDIO_PUBLIC_ACTIONS,{optional:true});
  private readonly cart=inject(CartStoreService);
  private readonly cartUi=inject(CampaignCartService);
  readonly subtitle = STEP_SUBTITLE;
  readonly nextLabel = STEP_NEXT;
  readonly shirtOptions = SHIRT_OPTIONS;
  readonly buyerFields: Array<{ key: BuyerField; label: string; type: string }> = [
    { key: 'name', label: 'שם מלא', type: 'text' }, { key: 'phone', label: 'טלפון', type: 'tel' }, { key: 'email', label: 'דוא״ל', type: 'email' }];

  readonly choices = signal<RaceChoice[]>([{ id: '0', name: 'הרשמה למירוץ', price: 0 }]);
  readonly step = signal<Step>(0);
  readonly records = signal<Participant[]>([]);
  readonly draft = signal<Participant | null>(null);
  readonly buyer = signal<Record<BuyerField, string>>({ name: '', phone: '', email: '' });
  readonly donation = signal(0);
  readonly notice = signal('');
  readonly error = signal('');
  readonly openMenu = signal<string | null>(null);
  private nextId = 1;

  readonly heatOptions = computed<SelectOption[]>(() => this.choices().map(c => ({ value: c.id, label: c.name + (c.price ? ' · ₪' + c.price : '') })));
  readonly total = computed(() => this.records().reduce((n, r) => n + this.heatPrice(r.heat), 0) + (Number(this.donation()) || 0));

  /** Called by the service before the view is created. */
  setChoices(choices: RaceChoice[]): void {
    this.choices.set(choices.length ? choices : [{ id: '0', name: 'הרשמה למירוץ', price: 0 }]);
    this.draft.set(this.newParticipant());
  }

  ngAfterViewInit(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    this.focusName();
  }

  close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.close) dialog.close(); else { dialog.removeAttribute('open'); this.closed.emit(); }
  }

  heatName(id: string): string { return this.choices().find(c => c.id === id)?.name || ''; }
  heatPrice(id: string): number { return this.choices().find(c => c.id === id)?.price || 0; }
  isExisting(id: number): boolean { return this.records().some(r => r.id === id); }
  optionLabel(options: SelectOption[], value: string): string { return options.find(o => o.value === String(value ?? ''))?.label || 'נא לבחור'; }

  setDraft(key: 'name' | 'birth' | 'heat' | 'shirt', value: string): void { this.draft.update(d => d ? { ...d, [key]: value } : d); }
  setBuyer(key: BuyerField, value: string): void { this.buyer.update(b => ({ ...b, [key]: value })); }
  setDonation(value: string): void { this.donation.set(Math.max(0, Number(value) || 0)); }

  toggleMenu(key: string): void { this.openMenu.update(open => open === key ? null : key); }
  choose(key: string, value: string): void { this.setDraft(key as 'heat' | 'shirt', value); this.openMenu.set(null); }

  /** Clicking any other button in the dialog closes an open select menu. */
  onDialogClick(event: MouseEvent): void {
    const button = (event.target as Element).closest('button');
    if (button && !button.closest('.hrm-select-wrap')) this.openMenu.set(null);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && (event.target as Element).closest('.hrm-menu')) this.openMenu.set(null);
  }

  openPicker(input: HTMLInputElement): void { try { input.showPicker(); } catch { input.focus(); } }

  add(): void {
    if (this.draft() && !this.saveDraft()) return;
    this.draft.set(this.newParticipant());
    this.notice.set('');
    this.focusName();
  }

  edit(id: number): void {
    if (this.draft() && !this.saveDraft()) return;
    const record = this.records().find(r => r.id === id);
    if (record) { this.draft.set({ ...record }); this.focusName(); }
  }

  remove(id: number): void { this.records.update(list => list.filter(r => r.id !== id)); }
  cancelEdit(): void { this.draft.set(null); this.error.set(''); }

  saveDraft(): boolean {
    const draft = this.draft();
    if (!draft) return true;
    const name = draft.name.trim();
    if (!name) { this.error.set('יש להזין שם משתתף'); this.focusName(); return false; }
    const saved = { ...draft, name };
    this.records.update(list => list.some(r => r.id === saved.id) ? list.map(r => r.id === saved.id ? saved : r) : [...list, saved]);
    this.draft.set(null);
    this.error.set('');
    this.notice.set('');
    return true;
  }

  back(): void {
    if (this.step() === 0) { this.close(); return; }
    this.step.update(s => (s - 1) as Step);
  }

  next(): void {
    switch (this.step()) {
      case 0:
        if (this.draft() && !this.saveDraft()) return;
        if (!this.records().length) { this.error.set('הוסף לפחות משתתף אחד'); return; }
        this.step.set(1);
        return;
      case 1:
        if (!this.buyer().name.trim()) { this.buyerInput()?.nativeElement.focus(); return; }
        this.step.set(2);
        return;
      default:
        if(this.platform){
          for(const choice of this.choices()){
            const people=this.records().filter(person=>person.heat===choice.id);
            if(people.length)this.cart.addRace({title:'הרשמה למירוץ',type:choice.name,unitPrice:choice.price,
              contact:{...this.buyer()},participants:people.map(person=>({fullName:person.name,birth:person.birth,registrationOptionId:choice.id,shirtSize:person.shirt}))});
          }
          const amount=Number(this.donation());
          if(amount>0)this.cart.entries.update(entries=>[...entries,{uid:'race-donation-'+Date.now(),kind:'donation',title:'תרומה נוספת',info:'',price:amount,qty:1}]);
          this.close();this.cartUi.open(false);return;
        }
        this.close();
    }
  }

  downloadTemplate(): void {
    const csv = '﻿שם,תאריך לידה,מקצה,מידת חולצה\r\nדוד ישראלי,2000-01-01,' + (this.choices()[0]?.name || 'מקצה') + ',M\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hamonym-race-participants-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw Error('גודל קובץ מרבי: 5MB');
      const rows = /\.xlsx$/i.test(file.name) ? await parseXlsx(file) : parseCsv(await file.text());
      const people = rowsToParticipants(rows);
      if (!people.length) throw Error('לא נמצאו שמות משתתפים לייבוא');
      const choices = this.choices();
      const imported = people.map(p => {
        const wanted = p.heatName;
        const match = choices.find(c => c.name === wanted || (c.name.includes(wanted) && wanted) || c.id === wanted);
        return { id: this.nextId++, name: p.name, birth: p.birth, heat: match?.id || choices[0].id, shirt: p.shirt };
      });
      this.records.update(list => [...list, ...imported]);
      this.draft.set(null);
      this.notice.set(`יובאו ${imported.length} משתתפים לרשימה לתצוגה. ניתן לערוך כל שורה.`);
      this.error.set('');
    } catch (err) {
      this.error.set('ייבוא נכשל: ' + (err as Error).message);
      this.notice.set('');
    } finally {
      input.value = '';
    }
  }

  private newParticipant(): Participant { return { id: this.nextId++, name: '', birth: '', heat: this.choices()[0].id, shirt: '' }; }
  private focusName(): void { afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector }); }
}
