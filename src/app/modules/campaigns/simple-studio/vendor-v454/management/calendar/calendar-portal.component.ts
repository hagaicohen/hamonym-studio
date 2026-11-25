import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CALENDAR_MONTHS, isoDate, parseIsoDate } from '../management-model.service';
import { CalendarService } from './calendar.service';

interface Day { day: number; iso: string; selected: boolean; today: boolean; past: boolean; }
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** The month grid of the open calendar (old `huDrawCalendar`). Clicks are handled by CalendarService. */
@Component({
  selector: 'div[ham-calendar-portal]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { id: 'huCalendarPortal', class: 'hu-calendar-portal', hidden: '' },
  template: `@if (month(); as m) {<div role="dialog" aria-label="בחירת תאריך" class="hu-calendar-popover" dir="rtl"><div class="hu-calendar-head"><button type="button" class="hu-calendar-arrow" data-hu-calendar-prev aria-label="החודש הקודם">‹</button><strong>{{ m.title }}</strong><button type="button" class="hu-calendar-arrow" data-hu-calendar-next aria-label="החודש הבא">›</button></div><div class="hu-calendar-grid"><div class="hu-calendar-weekdays">@for (d of weekdays; track d) {<span>{{ d }}</span>}</div><div class="hu-calendar-days">@for (p of m.pads; track $index) {<span class="hu-calendar-pad"></span>}@for (d of m.days; track d.iso) {<button type="button" class="hu-calendar-day" [class.selected]="d.selected" [class.today]="d.today" [attr.data-hu-day]="d.iso" [attr.aria-label]="d.day + ' ' + m.name + ' ' + m.year" [attr.aria-pressed]="d.selected ? 'true' : 'false'" [disabled]="d.past" [attr.title]="d.past ? 'תאריך שעבר' : null">{{ d.day }}</button>}</div></div><div class="hu-calendar-actions"><button type="button" data-hu-calendar-today>היום</button><button type="button" data-hu-calendar-tomorrow>מחר</button><button type="button" data-hu-calendar-clear>נקה תאריך</button></div></div>}`
})
export class CalendarPortalComponent {
  private readonly calendar = inject(CalendarService);
  readonly weekdays = WEEKDAYS;

  readonly month = computed(() => {
    const s = this.calendar.state();
    if (!s) return null;
    const { year: y, month: m } = s, chosen = parseIsoDate(s.value), today = new Date(), todayIso = isoDate(today);
    // In the wizard the campaign end date cannot be in the past.
    const wizardEnd = document.body.classList.contains('hw-wizard-active') && s.trigger.dataset['huDatePath'] === 'funding.end';
    const days: Day[] = Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => {
      const day = i + 1, iso = isoDate(new Date(y, m, day));
      return {
        day, iso,
        selected: !!chosen && chosen.getFullYear() === y && chosen.getMonth() === m && chosen.getDate() === day,
        today: today.getFullYear() === y && today.getMonth() === m && today.getDate() === day,
        past: wizardEnd && iso < todayIso
      };
    });
    return { title: `${CALENDAR_MONTHS[m]} ${y}`, name: CALENDAR_MONTHS[m], year: y, pads: Array.from({ length: new Date(y, m, 1).getDay() }), days };
  });
}
