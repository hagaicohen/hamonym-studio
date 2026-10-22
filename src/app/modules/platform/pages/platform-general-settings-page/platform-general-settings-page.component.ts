import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingSettingsService } from '../../services/billing-settings.service';
import { SimulationClockService, SimulationClockStatus } from '../../services/simulation-clock.service';

type SettingsTab = 'billing' | 'simulation';

// Platform Admin "הגדרות כלליות" (2026-09-14j) -- VAT moved here from
// "חיובי עמותות" because it is a Hamonym system setting, not an
// association-billing concept. Deliberately minimal: one section (חיוב
// ומיסוי) for the one real system setting that exists today. Not a
// settings framework -- add sections here only when a genuine new
// platform-wide setting exists, never to "fill out" this page.
//
// Reuses the same GET/PUT /api/platform/billing-settings API the VAT card
// used when it briefly lived on platform-billing-ops-page -- this is a
// placement/navigation change only, no backend/financial logic touched.
@Component({
  selector: 'app-platform-general-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-general-settings-page.component.html',
  styleUrl: './platform-general-settings-page.component.css',
})
export class PlatformGeneralSettingsPageComponent implements OnInit {
  private settingsService = inject(BillingSettingsService);
  private clockService = inject(SimulationClockService);

  tab: SettingsTab = 'billing';

  systemVatRatePercent: number | null = null;
  vatSettingLoading = true;
  vatSettingError: string | null = null;
  vatEditOpen = false;
  vatEditPercent = 18;
  vatSaveBusy = false;
  vatSaveError: string | null = null;

  ngOnInit(): void {
    this.loadVatSetting();
    this.loadClockStatus();
  }

  // The settings clock is independent of FIN-11 authorization and production time.
  clockStatus: SimulationClockStatus | null = null;
  clockLoading = true;
  clockError: string | null = null;
  // Split date/time controls (2026-10 redesign) -- a modern native
  // <input type="date"> + <input type="time"> pair reads far better than a
  // single combined datetime-local field, with zero new dependencies.
  fixedDateInput = '';
  fixedTimeInput = '';
  clockActionBusy = false;
  clockActionError: string | null = null;

  loadClockStatus(): void {
    this.clockLoading = true;
    this.clockError = null;
    this.clockService.getStatus().subscribe({
      next: (res) => {
        this.clockStatus = res;
        this.clockLoading = false;
      },
      error: () => {
        this.clockLoading = false;
        this.clockError = 'שגיאה בטעינת שעון הסימולציה';
      },
    });
  }

  // Clear, single-glance mode label (explicit product requirement #4).
  get clockModeLabel(): string {
    if (!this.clockStatus) return '';
    return this.clockStatus.overrideActive ? 'זמן מדומה' : 'זמן אמת';
  }

  // Primary action label switches once an override is already active
  // (2026-10 redesign: "הפעל זמן מדומה" the first time, "עדכן זמן מדומה"
  // to move an already-active simulated clock forward/back).
  get setClockButtonLabel(): string {
    if (this.clockActionBusy) return 'מעדכן...';
    return this.clockStatus?.overrideActive ? 'עדכן זמן מדומה' : 'הפעל זמן מדומה';
  }

  fmtDateTime(iso: string): string {
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  }

  toggleSimulation(): void {
    if (this.clockActionBusy || !this.clockStatus) return;
    this.clockActionBusy = true;
    this.clockActionError = null;
    this.clockService.setEnabled(!this.clockStatus.simulationEnabled).subscribe({
      next: (res) => { this.clockActionBusy = false; this.clockStatus = res; },
      error: (err) => {
        this.clockActionBusy = false;
        this.clockActionError = err?.error?.error || 'עדכון מצב הסימולציה נכשל';
      },
    });
  }

  setClockFixed(): void {
    if (this.clockActionBusy || !this.fixedDateInput || !this.fixedTimeInput || !this.clockStatus?.simulationEnabled) return;
    this.clockActionBusy = true;
    this.clockActionError = null;
    const iso = new Date(`${this.fixedDateInput}T${this.fixedTimeInput}`).toISOString();
    this.clockService.setFixed(iso).subscribe({
      next: (res) => { this.clockActionBusy = false; this.clockStatus = res; },
      error: (err) => {
        this.clockActionBusy = false;
        this.clockActionError = err?.error?.error || 'קביעת הזמן נכשלה';
      },
    });
  }

  resetClock(): void {
    if (this.clockActionBusy || !this.clockStatus?.simulationEnabled) return;
    this.clockActionBusy = true;
    this.clockActionError = null;
    this.clockService.reset().subscribe({
      next: (res) => { this.clockActionBusy = false; this.clockStatus = res; this.fixedDateInput = ''; this.fixedTimeInput = ''; },
      error: (err) => {
        this.clockActionBusy = false;
        this.clockActionError = err?.error?.error || 'האיפוס נכשל';
      },
    });
  }

  loadVatSetting(): void {
    this.vatSettingLoading = true;
    this.vatSettingError = null;
    this.settingsService.get().subscribe({
      next: (res) => {
        this.vatSettingLoading = false;
        if (res.setting) this.systemVatRatePercent = Number(res.setting.vat_rate) * 100;
      },
      error: () => {
        this.vatSettingLoading = false;
        this.vatSettingError = 'שגיאה בטעינת שיעור המע״מ';
      },
    });
  }

  openVatEdit(): void {
    this.vatEditPercent = this.systemVatRatePercent ?? 18;
    this.vatSaveError = null;
    this.vatEditOpen = true;
  }

  cancelVatEdit(): void {
    this.vatEditOpen = false;
  }

  saveVatSetting(): void {
    if (this.vatSaveBusy) return;
    this.vatSaveBusy = true;
    this.vatSaveError = null;
    this.settingsService.update(this.vatEditPercent / 100).subscribe({
      next: (res) => {
        this.vatSaveBusy = false;
        this.vatEditOpen = false;
        this.systemVatRatePercent = Number(res.setting.vat_rate) * 100;
      },
      error: (err) => {
        this.vatSaveBusy = false;
        this.vatSaveError = err?.error?.error || 'שמירת שיעור המע״מ נכשלה';
      },
    });
  }

  fmtMoney(v: number | string | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
