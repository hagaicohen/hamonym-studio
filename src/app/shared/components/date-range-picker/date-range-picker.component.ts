import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsRangeService, AnalyticsPreset } from '../../../core/services/analytics-range.service';

const PRESET_LABELS: Record<Exclude<AnalyticsPreset, 'custom'>, string> = {
  today: 'היום',
  '7d':  '7 ימים',
  '30d': '30 יום',
  '90d': '90 יום',
  // Explicitly "12 months" rather than "year" — the range is a rolling
  // 365-day window, not the calendar year or year-to-date, and leaving it
  // labeled "שנה" left that ambiguous.
  year:  '12 חודשים',
};

function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.css'],
})
export class DateRangePickerComponent {
  range = inject(AnalyticsRangeService);

  readonly presets = Object.keys(PRESET_LABELS) as Exclude<AnalyticsPreset, 'custom'>[];
  readonly labels = PRESET_LABELS;

  customOpen = false;
  customFrom = '';
  customTo = '';

  // "to" is stored exclusive (start of the day after the last included day),
  // but a human picking a date range means it inclusively — display the last
  // included day, not the exclusive boundary.
  readonly displayRange = computed(() => {
    const r = this.range.activeRange();
    const inclusiveTo = new Date(r.to);
    inclusiveTo.setDate(inclusiveTo.getDate() - 1);
    return `${toDisplayDate(r.from)} – ${toDisplayDate(inclusiveTo.toISOString().slice(0, 10))}`;
  });

  select(preset: Exclude<AnalyticsPreset, 'custom'>): void {
    this.customOpen = false;
    this.range.setPreset(preset);
  }

  openCustom(): void {
    const r = this.range.activeRange();
    this.customFrom = r.from;
    const inclusiveTo = new Date(r.to);
    inclusiveTo.setDate(inclusiveTo.getDate() - 1);
    this.customTo = inclusiveTo.toISOString().slice(0, 10);
    this.customOpen = true;
  }

  applyCustom(): void {
    if (!this.customFrom || !this.customTo) return;
    // User picks an inclusive end date; the service's contract wants the
    // exclusive boundary (start of the day after).
    const to = new Date(this.customTo);
    to.setDate(to.getDate() + 1);
    this.range.setCustom(this.customFrom, to.toISOString().slice(0, 10));
    this.customOpen = false;
  }

  cancelCustom(): void {
    this.customOpen = false;
  }
}
