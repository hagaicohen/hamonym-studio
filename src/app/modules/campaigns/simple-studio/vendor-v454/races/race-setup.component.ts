import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RaceHeat, RaceStateService, formatPrice, normalizePrice } from './race-state.service';

interface HeatForm { name: string; distance: string; price: string; start: string; limited: boolean; capacity: string; ageOn: boolean; minAge: string; }

const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Management panel: race heats (add/edit/delete) and demo participants. */
@Component({
  selector: 'ham-race-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
<section class="ham-race-setup-v210" data-ham-race-setup>
  <div class="ham-race-setup-head"><strong>הגדרות מירוץ · מקצים</strong><small>{{ heats().length }} מקצים</small></div>
  <div class="ham-heat-list">
    @for (h of heats(); track $index; let i = $index) {
      <div class="ham-heat-row">
        <span class="ham-heat-copy"><strong>{{ h.title || 'מקצה ' + (i + 1) }}</strong><small>{{ h.distance || 'מרחק לא הוגדר' }} · ₪{{ priceOf(h) }}{{ h.start ? ' · ' + h.start : '' }}</small></span>
        <button type="button" aria-label="ערוך מקצה" (click)="edit(i)">✎</button>
        <button type="button" aria-label="מחק מקצה" (click)="race.deleteHeat(i)">♲</button>
      </div>
    } @empty {
      <div class="ham-heat-row">אין עדיין מקצים. הוסיפו מקצה ראשון.</div>
    }
  </div>

  <div data-ham-heat-editor>
    @if (form(); as f) {
      <div class="ham-race-editor-v210">
        <label>שם מקצה<input #nameInput [value]="f.name" (input)="patch('name', $any($event.target).value)"></label>
        <div class="ham-heat-fields">
          <label>מרחק / סוג מקצה<input [value]="f.distance" (input)="patch('distance', $any($event.target).value)"></label>
          <label>מחיר הרשמה ₪<input type="text" inputmode="decimal" autocomplete="off" aria-label="מחיר הרשמה בשקלים" [value]="f.price" (input)="onPrice($any($event.target))"></label>
          <label>שעת זינוק<input type="time" step="60" [value]="f.start" (input)="patch('start', $any($event.target).value)"></label>
        </div>
        <label class="ham-opt"><input type="checkbox" [checked]="f.limited" (change)="patch('limited', $any($event.target).checked)">הגבלת משתתפים</label>
        <label [hidden]="!f.limited">מכסה<input type="number" min="1" [value]="f.capacity" (input)="patch('capacity', $any($event.target).value)"></label>
        <label class="ham-opt"><input type="checkbox" [checked]="f.ageOn" (change)="patch('ageOn', $any($event.target).checked)">הגבלת גיל</label>
        <label [hidden]="!f.ageOn">גיל מינימלי<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" [value]="f.minAge" (input)="onAge($any($event.target))"></label>
        <div style="display:flex;gap:7px">
          <button type="button" class="primary" (click)="save()">שמור מקצה</button>
          <button type="button" (click)="cancel()">ביטול</button>
        </div>
      </div>
    }
  </div>

  <button type="button" class="ham-race-add" (click)="edit(-1)">＋ הוסף מקצה</button>
  <div class="ham-race-manager-hint">שם הקמפיין, התמונה ומועדי הקמפיין מוגדרים באשף הרגיל. כל מקצה נשמר כשורה אחת. מכסה והגבלת גיל הן אופציונליות.</div>
  <hr style="width:100%;border:0;border-top:1px solid #edf0eb">
  <div class="ham-race-setup-head"><strong>משתתפי המירוץ</strong><small>{{ people().length }} משתתפים</small></div>
  <div class="ham-race-manager-hint">המשתתפים נפרדים מתורמים. בדמו אפשר להוסיף שמות לצורך בדיקת התצוגה; אין כאן קליטה של הרשמות ותשלומים מהשרת.</div>
  <div class="ham-person-manager-list">
    @for (p of people(); track $index; let i = $index) {
      <div class="ham-person-manager-row"><span>{{ p.name }} · {{ race.heatName(p) }}</span><button type="button" aria-label="מחק משתתף" (click)="race.removeParticipant(i)">✕</button></div>
    } @empty {
      <small>אין משתתפים רשומים בנתוני הדמו.</small>
    }
  </div>
  <div class="ham-person-add">
    <input #newPerson placeholder="שם משתתף" aria-label="שם משתתף">
    <select #newHeat aria-label="מקצה">
      @for (h of heats(); track $index) { <option [value]="$index">{{ h.title || 'מקצה' }}</option> }
    </select>
    <button type="button" (click)="addPerson(newPerson, newHeat)">הוסף</button>
  </div>
</section>`
})
export class RaceSetupComponent {
  readonly race = inject(RaceStateService);
  readonly form = signal<HeatForm | null>(null);
  private editing = -1;
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly heats = computed(() => { this.race.version(); return this.race.heats(); });
  readonly people = computed(() => { this.race.version(); return this.race.participants(); });

  priceOf(h: RaceHeat): number { return Number(h.price) || 0; }

  edit(index: number): void {
    this.editing = index;
    const item: RaceHeat = index < 0 ? {} : this.race.heats()[index] || {};
    const capacity = Number(item.capacity) > 0 ? Number(item.capacity) : 0;
    this.form.set({
      name: String(item.title || ''), distance: String(item.distance || ''), price: formatPrice(item.price),
      start: VALID_TIME.test(String(item.start || '')) ? String(item.start) : '',
      limited: capacity > 0, capacity: capacity ? String(capacity) : '',
      ageOn: !!item.minAge, minAge: String(Number(item.minAge) || '')
    });
  }

  patch<K extends keyof HeatForm>(key: K, value: HeatForm[K]): void { this.form.update(f => f ? { ...f, [key]: value } : f); }

  /** Keeps thousands separators while typing without moving the caret. */
  onPrice(input: HTMLInputElement): void {
    const digitsBefore = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/[^0-9.]/g, '').length;
    input.value = normalizePrice(input.value);
    let pos = 0, seen = 0;
    while (pos < input.value.length && seen < digitsBefore) { if (/[0-9.]/.test(input.value[pos])) seen++; pos++; }
    try { input.setSelectionRange(pos, pos); } catch { /* unsupported input type */ }
    this.patch('price', input.value);
  }

  onAge(input: HTMLInputElement): void { input.value = input.value.replace(/\D/g, ''); this.patch('minAge', input.value); }

  cancel(): void { this.form.set(null); }

  addPerson(nameInput: HTMLInputElement, heatSelect: HTMLSelectElement): void {
    const name = nameInput.value.trim(), heat = Number(heatSelect.value);
    if (!name || !this.race.heats()[heat]) return;
    this.race.addParticipant(name, heat);
    nameInput.value = '';
  }

  save(): void {
    const f = this.form();
    if (!f) return;
    const name = f.name.trim();
    if (!name) { this.nameInput()?.nativeElement.focus(); return; }
    this.race.saveHeat(this.editing, {
      title: name, distance: f.distance,
      price: Math.max(0, Number(f.price.replace(/,/g, '')) || 0),
      start: f.start,
      capacity: f.limited ? Math.max(1, Number(f.capacity) || 1) : 0,
      minAge: f.ageOn ? Math.max(0, Number(f.minAge) || 0) : null
    });
    this.form.set(null);
  }
}
