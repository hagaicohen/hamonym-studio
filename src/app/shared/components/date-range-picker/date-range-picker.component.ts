import { DropdownComponent, DropdownOptionComponent } from '../../ui/dropdown/dropdown.component';
import { Component, EventEmitter, Input, Output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsRangeService, AnalyticsPreset } from '../../../core/services/analytics-range.service';

const PRESET_LABELS: Record<Exclude<AnalyticsPreset, 'custom'>, string> = {
  calendar_12m: '12 חודשים קלנדריים',
  all: 'הכל',
  month: 'החודש',
  last_month: 'חודש שעבר',
  today: 'היום',
  '7d':  '7 ימים',
  '30d': '30 יום',
  '90d': '90 יום',
  // Explicitly "12 months" rather than "year" — the range is a rolling
  // 365-day window, not the calendar year or year-to-date, and leaving it
  // labeled "שנה" left that ambiguous.
  year:  '12 חודשים',
};

export function shiftCivilDate(iso: string, days: number): string {
  const date = new Date(iso + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, DropdownComponent, DropdownOptionComponent],
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.css'],
})
export class DateRangePickerComponent {
  range = inject(AnalyticsRangeService);

  @Input() fixedOptions?: readonly { key: string; label: string }[];
  @Input() fixedValue = '';
  @Input() fixedRangeText = '';
  @Input() billingMonth: string | null = null;
  @Input() billingMonthLabel = '';
  @Input() billingMonthPresets: readonly { key: string; label: string }[] = [];
  @Input() billingMonthRangeText = '';
  @Output() fixedValueChange = new EventEmitter<string>();
  @Output() billingMonthChange = new EventEmitter<string>();

  setBillingMonth(value: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    this.periodOpen = false;
    this.billingMonthChange.emit(value);
  }

  @Input() campaign = false;
  @Input() allowAll = true;
  @Input() showRange = false;
  @Input() includeCalendarMonths = false;
  get presets(): Exclude<AnalyticsPreset, 'custom'>[] {
    const defaults: Exclude<AnalyticsPreset, 'custom'>[] = ['today', '7d', '30d', '90d', 'year'];
    return this.campaign
      ? [...(this.allowAll ? ['all' as const] : []), ...defaults.slice(0, 4), 'month', 'last_month', 'year', ...(this.includeCalendarMonths ? ['calendar_12m' as const] : [])]
      : defaults;
  }
  rollingCount: number | null = null;
  rollingUnit: 'days' | 'months' = 'days';
  customError = '';
  readonly labels = PRESET_LABELS;

  readonly campaignLabels = {
    ...PRESET_LABELS, all: 'כל הזמנים', '7d': '7 ימים אחרונים', '30d': '30 ימים אחרונים',
    '90d': '90 ימים אחרונים', year: '12 חודשים אחרונים',
  };
  readonly campaignLabel = computed(() => {
    const { preset } = this.range.activeRange();
    return preset === 'custom' ? this.displayRange() : this.campaignLabels[preset];
  });
  periodOpen = false;
  customOpen = false;
  customFrom = '';
  customTo = '';

  // "to" is stored exclusive (start of the day after the last included day),
  // but a human picking a date range means it inclusively — display the last
  // included day, not the exclusive boundary.
  readonly displayRange = computed(() => {
    const r = this.range.activeRange();
    return r.from ? `${toDisplayDate(r.from)} – ${toDisplayDate(shiftCivilDate(r.to, -1))}` : 'כל התקופה';
  });

  select(preset: Exclude<AnalyticsPreset, 'custom'>): void {
    this.customOpen = false;
    this.range.setPreset(preset);
    this.periodOpen = false;
  }

  openCustom(): void {
    const r = this.range.activeRange();
    this.customFrom = r.from;
    this.customTo = r.to ? shiftCivilDate(r.to, -1) : '';
    this.customError = '';
    this.rollingCount = null;
    this.customOpen = true;
  }

  toggleCampaignPicker(): void {
    this.periodOpen = !this.periodOpen;
    if (this.periodOpen) this.openCustom();
  }

  applyRolling(): void {
    const count = this.rollingCount;
    if (count === null || !Number.isSafeInteger(count) || count < 1 || count > (this.rollingUnit === 'days' ? 3660 : 120)) {
      this.customError = 'יש להזין מספר ימים או חודשים בטווח המותר';
      return;
    }
    this.range.setRolling(count, this.rollingUnit);
    this.periodOpen = false;
  }

  applyCustom(): void {
    if (!this.customFrom || !this.customTo || this.customFrom > this.customTo) {
      this.customError = 'יש לבחור טווח תאריכים תקין';
      return;
    }
    this.range.setCustom(this.customFrom, shiftCivilDate(this.customTo, 1));
    this.customOpen = false;
    this.periodOpen = false;
  }

  cancelCustom(): void {
    this.customOpen = false;
  }
}
