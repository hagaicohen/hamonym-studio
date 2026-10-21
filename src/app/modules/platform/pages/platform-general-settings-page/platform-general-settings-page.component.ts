import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingSettingsService } from '../../services/billing-settings.service';
import { SimulationClockService, SimulationClockStatus } from '../../services/simulation-clock.service';
import { CampaignResetService, CampaignResetPreview, CampaignResetResult } from '../../services/campaign-reset.service';
import { PlatformService } from '../../services/platform.service';
import { EntityComboboxComponent, ComboboxEntity } from '../../components/entity-combobox/entity-combobox.component';

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
  imports: [CommonModule, FormsModule, EntityComboboxComponent],
  templateUrl: './platform-general-settings-page.component.html',
  styleUrl: './platform-general-settings-page.component.css',
})
export class PlatformGeneralSettingsPageComponent implements OnInit, OnDestroy {
  private settingsService = inject(BillingSettingsService);
  private clockService = inject(SimulationClockService);
  private campaignResetService = inject(CampaignResetService);
  private platformService = inject(PlatformService);

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
    this.loadAllCampaigns();
  }

  // --- כלי סימולציה (2026-10) -- Super Admin access to the EXISTING
  // backend business clock. GET is always safe; every write is
  // independently refused server-side (403 SIMULATION_DISABLED) unless
  // HAMONYM_SIMULATION_MODE='on' in THAT backend process -- never true in
  // production today (see simulation-clock.service.ts's own header). The
  // controls below render visibly disabled whenever the server reports
  // simulationEnabled=false, which is every environment this app can
  // currently reach.
  clockStatus: SimulationClockStatus | null = null;
  clockLoading = true;
  clockError: string | null = null;
  fixedDatetimeInput = '';
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

  // "Hiding the clock must also disable simulated mode and restore real
  // time. Never leave a hidden simulated clock active" (explicit product
  // requirement) -- leaving this page is the only way the clock UI becomes
  // hidden on this screen, so that is the signal. Fire-and-forget: the
  // component is already being torn down, there is no view left to update,
  // and the backend call completes independently of this component's
  // lifecycle (HttpClient requests are not auto-cancelled on destroy).
  ngOnDestroy(): void {
    if (this.clockStatus?.overrideActive) {
      this.clockService.reset().subscribe({ error: () => {} });
    }
  }

  // Clear, single-glance mode label (explicit product requirement #4).
  get clockModeLabel(): string {
    if (!this.clockStatus) return '';
    if (!this.clockStatus.overrideActive) return 'מצב פעיל: זמן אמת (ברירת מחדל)';
    return 'מצב פעיל: זמן מדומה';
  }

  fmtDateTime(iso: string): string {
    const d = new Date(iso);
    const [y, m, day] = iso.slice(0, 10).split('-');
    const time = d.toTimeString().slice(0, 5);
    return `${day}/${m}/${y} ${time}`;
  }

  setClockFixed(): void {
    if (this.clockActionBusy || !this.fixedDatetimeInput || !this.clockStatus?.simulationEnabled) return;
    this.clockActionBusy = true;
    this.clockActionError = null;
    const iso = new Date(this.fixedDatetimeInput).toISOString();
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
      next: (res) => { this.clockActionBusy = false; this.clockStatus = res; this.fixedDatetimeInput = ''; },
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

  // --- B. איפוס תרומות לקמפיין (2026-10) ----------------------------------
  // Campaign picker reuses the EXISTING EntityComboboxComponent (already
  // used identically for nonprofits on platform-collection-ops-page) --
  // click opens a dropdown of ALL loaded campaigns, typing filters it by
  // name. No new picker UI pattern, no new listing endpoint: the full list
  // loads once via PlatformService#getCampaigns the same way
  // collection-ops-page eagerly loads allEntities. Everything destructive
  // goes through campaign-reset.service.js (backend), which is the one
  // place that actually reconciles statements; this component only drives
  // it.
  allCampaigns: Array<{ id: string; title: string; entity_name: string }> = [];
  allCampaignsLoading = false;
  selectedCampaignComboId: string | undefined;

  campaignPreview: CampaignResetPreview | null = null;
  campaignPreviewLoading = false;
  campaignPreviewError: string | null = null;
  campaignResetConfirmOpen = false;
  campaignResetReason = '';
  campaignResetBusy = false;
  campaignResetError: string | null = null;
  campaignResetResult: CampaignResetResult | null = null;

  private loadAllCampaigns(): void {
    this.allCampaignsLoading = true;
    this.platformService.getCampaigns({ limit: 1000 }).subscribe({
      next: (res: any) => { this.allCampaigns = res.campaigns || []; this.allCampaignsLoading = false; },
      error: () => { this.allCampaignsLoading = false; },
    });
  }

  get campaignComboOptions(): ComboboxEntity[] {
    return this.allCampaigns.map((c) => ({
      id: c.id,
      name: c.entity_name ? `${c.title} — ${c.entity_name}` : c.title,
    }));
  }

  onCampaignComboSelect(id: string | undefined): void {
    this.selectedCampaignComboId = id;
    if (!id) {
      this.campaignPreview = null;
      this.campaignResetConfirmOpen = false;
      this.campaignResetReason = '';
      this.campaignResetResult = null;
      return;
    }
    const c = this.allCampaigns.find((x) => x.id === id);
    if (!c) return;
    this.selectCampaign(c);
  }

  selectCampaign(c: { id: string; title: string }): void {
    this.campaignResetConfirmOpen = false;
    this.campaignResetReason = '';
    this.campaignResetResult = null;
    this.loadCampaignPreview(c.id);
  }

  private loadCampaignPreview(campaignId: string): void {
    this.campaignPreviewLoading = true;
    this.campaignPreviewError = null;
    this.campaignResetService.getPreview(campaignId).subscribe({
      next: (res) => { this.campaignPreview = res.preview; this.campaignPreviewLoading = false; },
      error: (err) => {
        this.campaignPreviewLoading = false;
        this.campaignPreviewError = err?.error?.error || 'שגיאה בטעינת פרטי הקמפיין';
      },
    });
  }

  confirmCampaignReset(): void {
    if (this.campaignResetBusy || !this.campaignPreview || !this.campaignResetReason.trim()) return;
    this.campaignResetBusy = true;
    this.campaignResetError = null;
    const campaignId = this.campaignPreview.campaignId;
    this.campaignResetService.reset(campaignId, this.campaignResetReason.trim()).subscribe({
      next: (res) => {
        this.campaignResetBusy = false;
        this.campaignResetConfirmOpen = false;
        this.campaignResetResult = res.result;
        // Refresh the preview so the shown counts/amount reflect the real
        // post-reset state (0 donations), without wiping the success
        // message selectCampaign() would otherwise clear.
        this.loadCampaignPreview(campaignId);
      },
      error: (err) => {
        this.campaignResetBusy = false;
        this.campaignResetError = err?.error?.error || 'האיפוס נכשל';
      },
    });
  }

  fmtMoney(v: number | string | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
