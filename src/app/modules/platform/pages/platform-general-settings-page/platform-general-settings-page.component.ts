import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingSettingsService } from '../../services/billing-settings.service';

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

  systemVatRatePercent: number | null = null;
  vatSettingLoading = true;
  vatSettingError: string | null = null;
  vatEditOpen = false;
  vatEditPercent = 18;
  vatSaveBusy = false;
  vatSaveError: string | null = null;

  ngOnInit(): void {
    this.loadVatSetting();
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
}
