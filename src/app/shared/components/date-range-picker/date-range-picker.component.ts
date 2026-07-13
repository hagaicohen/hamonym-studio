import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsRangeService, AnalyticsPreset } from '../../../core/services/analytics-range.service';

const PRESET_LABELS: Record<Exclude<AnalyticsPreset, 'custom'>, string> = {
  today: 'היום',
  '7d':  '7 ימים',
  '30d': '30 יום',
  '90d': '90 יום',
  year:  'שנה',
};

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.css'],
})
export class DateRangePickerComponent {
  range = inject(AnalyticsRangeService);

  readonly presets = Object.keys(PRESET_LABELS) as Exclude<AnalyticsPreset, 'custom'>[];
  readonly labels = PRESET_LABELS;

  select(preset: Exclude<AnalyticsPreset, 'custom'>): void {
    this.range.setPreset(preset);
  }
}
