import { ApplicationRef, ComponentRef, DestroyRef, EnvironmentInjector, Injectable, createComponent, inject, signal } from '@angular/core';
import { ManagementModelService, displayDate, isoDate, parseIsoDate } from '../management-model.service';
import { ManagementEditService } from '../management-edit.service';
import { escapeHtml } from '../fields/markup';
import { CALENDAR_SVG } from '../fields/field-icons';
import { CalendarPortalComponent } from './calendar-portal.component';

import { studioAdopt, studioListen } from '../../core/studio-session';
/** The open calendar: the trigger it belongs to, the month shown and the value when it opened. */
export interface CalendarState { trigger: HTMLElement; year: number; month: number; value: string; }

/**
 * Markup of a date trigger outside Angular templates (the wizard's end date, through
 * `window.hamonymWizardShared.calendarField`). Management fields render the same button in
 * their template (TextFieldComponent).
 */
export function calendarTriggerMarkup(value: string, path: string, disabled = false): string {
  return `<button class="hu-date-trigger ${parseIsoDate(value) ? 'has-value' : ''}" ${disabled ? 'disabled aria-disabled="true"' : ''} type="button" data-hu-date-trigger="1" data-hu-date-path="${escapeHtml(path)}" aria-haspopup="dialog" aria-expanded="false"><span class="hu-date-icon">${CALENDAR_SVG}</span><span class="hu-date-value">${displayDate(value) || 'בחרו תאריך'}</span></button>`;
}

/**
 * Hebrew date picker shared by the management fields and the wizard (old engine `huCalendar`,
 * `huOpenCalendar`, `huSelectCalendar`, `huPlaceCalendar` and their document handlers).
 * Any `[data-hu-date-trigger][data-hu-date-path]` button opens it; the value is stored as an ISO
 * `YYYY-MM-DD` date through ManagementEditService.commit, which redraws the management screen.
 * The popover is CalendarPortalComponent, mounted on `#huCalendarPortal` at the end of `<body>`.
 */
@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly model = inject(ManagementModelService);
  private readonly edit = inject(ManagementEditService);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly destroyRef = inject(DestroyRef);
  private portal: ComponentRef<CalendarPortalComponent> | null = null;

  readonly state = signal<CalendarState | null>(null);

  /** Mounts the portal and the document handlers (at the point where the engine created them). */
  start(): void {
    if (this.portal) return;
    const host = document.createElement('div');
    document.body.appendChild(studioAdopt(host));
    this.portal = createComponent(CalendarPortalComponent, { environmentInjector: this.injector, hostElement: host });
    this.appRef.attachView(this.portal.hostView);
    this.portal.changeDetectorRef.detectChanges();

    const onClick = (e: MouseEvent): void => this.click(e);
    const onKey = (e: KeyboardEvent): void => { if (this.state() && e.key === 'Escape') { e.stopImmediatePropagation(); this.close(true); } };
    const onPlace = (): void => { if (this.state()) this.place(); };
    studioListen(document, 'click', onClick);
    studioListen(document, 'keydown', onKey, true);
    studioListen(window, 'resize', onPlace);
    studioListen(document, 'scroll', onPlace, { capture: true, passive: true });
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onPlace);
      document.removeEventListener('scroll', onPlace, { capture: true });
      this.portal?.destroy();
    });
  }

  private get host(): HTMLElement { return this.portal!.location.nativeElement as HTMLElement; }

  private click(e: MouseEvent): void {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const trigger = target.closest<HTMLElement>('[data-hu-date-trigger]');
    if (trigger) { if (!trigger.hasAttribute('disabled')) this.open(trigger); return; }
    if (!this.state()) return;
    const button = target.closest<HTMLButtonElement>('#huCalendarPortal button');
    if (!button) { if (!target.closest('#huCalendarPortal')) this.close(); return; }
    const d = button.dataset;
    if (d['huDay']) { this.select(d['huDay']); return; }
    if (button.hasAttribute('data-hu-calendar-clear')) { this.select(''); return; }
    if (button.hasAttribute('data-hu-calendar-today')) { this.select(isoDate(new Date())); return; }
    if (button.hasAttribute('data-hu-calendar-tomorrow')) { const t = new Date(); t.setDate(t.getDate() + 1); this.select(isoDate(t)); return; }
    if (button.hasAttribute('data-hu-calendar-prev') || button.hasAttribute('data-hu-calendar-next')) {
      const s = this.state()!, next = new Date(s.year, s.month + (button.hasAttribute('data-hu-calendar-prev') ? -1 : 1), 1);
      this.show({ ...s, year: next.getFullYear(), month: next.getMonth() });
    }
  }

  /** Clicking the trigger of the open calendar closes it. */
  open(trigger: HTMLElement): void {
    if (this.state()?.trigger === trigger) { this.close(); return; }
    this.close();
    const value = String(this.model.get(trigger.dataset['huDatePath'] || '') || '');
    const d = parseIsoDate(value) || new Date();
    this.host.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    this.show({ trigger, year: d.getFullYear(), month: d.getMonth(), value });
    this.place();
  }

  close(focus = false): void {
    const s = this.state();
    if (!s) return;
    this.state.set(null);
    this.host.hidden = true;
    s.trigger.setAttribute('aria-expanded', 'false');
    if (focus && s.trigger.isConnected) s.trigger.focus();
  }

  /** Stores the date (empty: cleared) and redraws, then closes. */
  private select(iso: string): void {
    const s = this.state();
    if (!s) return;
    const path = s.trigger.dataset['huDatePath'];
    if (path === 'funding.start' && !iso) return;
    if (path) { this.edit.snapshot(); this.edit.commit(path, iso, { rebuild: true }); }
    this.close();
  }

  /** The popover keeps its last month and position while hidden (it is only redrawn when shown). */
  private show(state: CalendarState): void {
    this.state.set(state);
    this.portal!.changeDetectorRef.detectChanges();
  }

  /** Below the trigger, or above it when there is no room (old `huPlaceCalendar`). */
  private place(): void {
    const s = this.state();
    if (!s) return;
    const r = s.trigger.getBoundingClientRect(), w = Math.min(344, innerWidth - 16), below = innerHeight - r.bottom, style = this.host.style;
    style.width = w + 'px';
    style.right = Math.max(8, Math.min(innerWidth - w - 8, innerWidth - r.right)) + 'px';
    const height = Math.min(this.host.scrollHeight, innerHeight - 16);
    const preferred = below >= height + 6 || below > r.top ? r.bottom + 6 : r.top - height - 6;
    style.top = Math.max(8, Math.min(preferred, innerHeight - height - 8)) + 'px';
  }
}
