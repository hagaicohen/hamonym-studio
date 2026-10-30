import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingSettingsService } from '../../services/billing-settings.service';
import { SimulationClockService, SimulationClockStatus } from '../../services/simulation-clock.service';
import { PlatformService } from '../../services/platform.service';
import { CampaignResetService, CampaignResetStatus, CampaignResetPreview } from '../../services/campaign-reset.service';
import { AdminDetailsDrawerComponent } from '../../components/admin-details-drawer/admin-details-drawer.component';
import { israelDate, shekels } from '../../utils/admin-display';

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
  imports: [CommonModule, FormsModule, AdminDetailsDrawerComponent],
  templateUrl: './platform-general-settings-page.component.html',
  styleUrl: './platform-general-settings-page.component.css',
})
export class PlatformGeneralSettingsPageComponent implements OnInit {
  private settingsService = inject(BillingSettingsService);
  private clockService = inject(SimulationClockService);
  private platformService = inject(PlatformService);
  private campaignResetService = inject(CampaignResetService);

  tab: SettingsTab = 'billing';

  systemVatRatePercent: number | null = null;
  vatSettingLoading = true;
  vatSettingError: string | null = null;
  vatEditOpen = false;
  vatEditPercent = 18;
  vatSaveBusy = false;
  vatSaveError: string | null = null;
  masavMode: 'entity' | 'period' | null = null;
  masavSaveBusy = false;
  masavSaveError = '';
  masavSaved = false;
  saveMasavMode(): void {
    if (!this.masavMode || this.masavSaveBusy) return;
    this.masavSaveBusy = true; this.masavSaveError = ''; this.masavSaved = false;
    this.settingsService.updateMasavConsolidation(this.masavMode).subscribe({
      next: ({ setting }) => { this.masavSaveBusy = false; this.masavMode = setting.masav_consolidation_mode ?? null; this.masavSaved = true; },
      error: () => { this.masavSaveBusy = false; this.masavSaveError = 'ההגדרה לא נשמרה. יש לוודא שגרסת השרת והמיגרציה מעודכנות.'; },
    });
  }

  ngOnInit(): void {
    this.loadVatSetting();
    this.loadClockStatus();
    this.loadCampaigns();
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
  clockActionMessage: string | null = null;
  money = shekels;
  campaignPreview: CampaignResetPreview | null = null;
  campaignPreviewError: string | null = null;
  closeResetConfirmation(): void { if (!this.resetBusy) this.resetConfirmOpen = false; }
  get selectedBusinessDateLabel(): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fixedDateInput)) return '';
    const [year, month, day] = this.fixedDateInput.split('-'); return `${day}/${month}/${year}`;
  }

  loadClockStatus(): void {
    this.clockLoading = true;
    this.clockError = null;
    this.clockService.getStatus().subscribe({
      next: (res) => {
        this.clockStatus = res;
        const fields = this.israelFields(res.businessNow);
        this.fixedDateInput = fields.date;
        this.fixedTimeInput = fields.time;
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

  get setClockButtonLabel(): string {
    return this.clockActionBusy ? 'מעדכן...' : 'קבע זמן עסקי';
  }

  fmtDateTime(iso: string): string {
    return israelDate(iso, true);
  }

  private israelFields(iso: string): { date: string; time: string } {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
    return { date: `${parts['year']}-${parts['month']}-${parts['day']}`, time: `${parts['hour']}:${parts['minute']}` };
  }

  setClockFixed(): void {
    if (this.clockActionBusy || !this.fixedDateInput || !this.fixedTimeInput || !this.clockStatus) return;
    this.clockActionError = null;
    this.clockActionMessage = null;
    const wallTime = Date.parse(`${this.fixedDateInput}T${this.fixedTimeInput}:00Z`);
    if (!Number.isFinite(wallTime)) { this.clockActionError = 'יש לבחור תאריך ושעה תקינים'; return; }
    let instant = wallTime;
    for (let i = 0; i < 2; i++) {
      const fields = this.israelFields(new Date(instant).toISOString());
      instant += wallTime - Date.parse(`${fields.date}T${fields.time}:00Z`);
    }
    const iso = new Date(instant).toISOString();
    const fields = this.israelFields(iso);
    if (fields.date !== this.fixedDateInput || fields.time !== this.fixedTimeInput) { this.clockActionError = 'השעה אינה קיימת בשעון ישראל. יש לבחור שעה אחרת'; return; }
    this.clockActionBusy = true;
    this.clockService.setFixed(iso).subscribe({
      next: (res) => {
        this.clockActionBusy = false; this.clockStatus = res;
        const reasons: Record<string, string> = {
          cutoff_not_reached: 'מועד החיוב החודשי טרם הגיע',
          calculation_incomplete: 'חישוב החיובים לא הושלם; הגבייה נעצרה',
          approval_failed: 'אישור החיובים נכשל; הגבייה נעצרה',
          PERIOD_OVERLAP_MISMATCH: 'קיימת תקופת חיוב חופפת; נדרשת בדיקה לפני המשך',
          no_active_payment_instrument: 'לא מוגדר אמצעי תשלום פעיל וברירת מחדל',
          retry_not_yet_due: 'מועד הניסיון החוזר טרם הגיע',
          max_attempts_reached: 'מוצו הניסיונות האוטומטיים',
          entity_collection_held: 'הגבייה חסומה לטיפול מנהל',
          masav_proposal_exported_unresolved: 'קיים תהליך מס״ב פתוח',
          simulation_day_already_attempted: 'כבר בוצע ניסיון ביום העסקי הזה',
          billing_migrations_required: 'סכמת החיוב חסרה; יש להשלים מיגרציות 075 ו־076 לפני גבייה',
          billing_already_running: 'מחזור הגבייה כבר מתבצע; לא נוצר חיוב נוסף',
          billing_job_failed: 'שלב הגבייה נכשל; ניתן לנסות שוב ללא יצירת חיוב כפול',
        };
        const summary = res.results?.map(step => {
          const errors = step.result?.errors;
          const errorCount = Array.isArray(errors) ? errors.length : errors ?? 0;
          if (errorCount > 0) return `שלב הגבייה הסתיים עם ${errorCount} שגיאות; יש לבדוק את מרכז הטיפול`;
          if (step.result?.reason) return reasons[step.result.reason] || 'שלב הסימולציה נעצר; יש לבדוק את דוח ההרצה';
          if (step.status !== 'success') return 'שלב הסימולציה לא הושלם; לא בוצעה גבייה נוספת';
          if (step.step === 'monthly_billing') return `נוצרו ${step.result?.statementsCreated ?? 0} חיובים ואושרו ${step.result?.approved ?? 0}`;
          if (step.step === 'fin11-card-collection' || step.step === 'fin11-card-retry-sweep') {
            const skipped = Object.entries(step.result?.skippedReasons ?? {}).map(([reason, count]) => `${reasons[reason] || 'הגבייה דולגה בשל תנאי הזכאות הקיימים'} (${count})`).join(', ');
            return `הושלמו ${step.result?.succeeded ?? 0} גביות מדומות` + (skipped ? '. ' + skipped : '');
          }
          return '';
        }).filter(Boolean).join('. ');
        this.clockActionMessage = 'הזמן העסקי עודכן. ' + (res.skipped ? reasons[res.skipped] || 'לא בוצעה גבייה' : summary || '');
      },
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
    this.clockActionMessage = null;
    this.clockService.reset().subscribe({
      next: (res) => { this.clockActionBusy = false; this.clockStatus = res; this.fixedDateInput = ''; this.fixedTimeInput = ''; this.clockActionMessage = 'המערכת חזרה לזמן אמת'; },
      error: (err) => {
        this.clockActionBusy = false;
        this.clockActionError = err?.error?.error || 'האיפוס נכשל';
      },
    });
  }

  campaigns: Array<{ id: string; title: string; entity_name?: string }> = [];
  campaignsLoading = false;
  campaignsError: string | null = null;
  selectedCampaignId = '';
  campaignResetStatus: CampaignResetStatus | null = null;
  campaignStatusLoading = false;
  campaignStatusError: string | null = null;

  loadCampaigns(): void {
    this.campaignsLoading = true;
    this.campaignsError = null;
    this.platformService.getCampaigns({ limit: 1000 }).subscribe({
      next: (res) => { this.campaigns = res.campaigns || []; this.campaignsLoading = false; },
      error: () => { this.campaignsLoading = false; this.campaignsError = 'לא ניתן לטעון את רשימת הקמפיינים. ניתן לנסות שוב.'; },
    });
  }

  resetConfirmOpen = false;
  resetReason = '';
  resetTypedTitle = '';
  resetBusy = false;
  resetError: string | null = null;
  resetResult: string | null = null;
  readonly resetTableNames: Record<string, string> = {
    donations: 'תרומות', receipts: 'קבלות', payments: 'תשלומים', collection_attempts: 'ניסיונות גבייה',
    statements: 'חיובים', statement_components: 'רכיבי חיוב', statement_adjustments: 'התאמות חיוב',
    billing_runs: 'ריצות חיוב פרטיות', email_logs: 'רישומי דואר', registration_orders: 'הרשמות',
    registration_participants: 'משתתפים', masav_collection_proposals: 'הצעות מס״ב',
  };
  get resetCountRows(): Array<{table: string; name: string; count: number}> {
    return Object.entries(this.campaignResetStatus?.counts || {}).filter(([,n]) => n > 0)
      .map(([table,count]) => ({table,name:this.resetTableNames[table] || table,count}));
  }
  confirmCampaignReset(): void {
    const status = this.campaignResetStatus;
    if (this.resetBusy || !this.resetConfirmOpen || !status?.available || status.campaignId !== this.selectedCampaignId
      || this.resetTypedTitle !== status.campaignTitle || this.resetReason.trim().length < 3) return;
    this.resetBusy = true;
    this.resetError = null;
    this.campaignResetService.reset(status.campaignId, this.resetReason.trim(), this.resetTypedTitle, status.snapshotHash).subscribe({
      next: (res) => {
        this.resetBusy = false;
        this.resetConfirmOpen = false;
        this.loadCampaigns();
        this.selectCampaign(status.campaignId);
        this.resetResult = res.result.reset ? 'האיפוס הושלם ואומת. מזהה הגיבוי: ' + res.result.backupId : 'לא התקבל אישור להשלמת האיפוס. יש לרענן את המצב.';
      },
      error: (err) => {
        this.resetBusy = false;
        this.resetConfirmOpen = false;
        this.selectCampaign(status.campaignId);
        this.resetError = err?.error?.error || 'לא ניתן לאמת את השלמת האיפוס. יש לבדוק את המצב והגיבוי לפני ניסיון נוסף.';
      },
    });
  }

  selectCampaign(id: string): void {
    if (this.resetBusy) return;
    this.resetConfirmOpen = false;
    this.resetReason = '';
    this.resetTypedTitle = '';
    this.resetError = null;
    this.resetResult = null;
    this.selectedCampaignId = id;
    this.campaignResetStatus = null;
    this.campaignPreview = null; this.campaignPreviewError = null;
    this.campaignStatusError = null;
    this.campaignStatusLoading = !!id;
    if (!id) return;
    this.campaignResetService.getPreview(id).subscribe({
      next: res => { if (this.selectedCampaignId === id) this.campaignPreview = res.preview; },
      error: () => { if (this.selectedCampaignId === id) this.campaignPreviewError = 'סיכום סכומי התרומות אינו זמין כעת.'; },
    });
    this.campaignResetService.getStatus(id).subscribe({
      next: (res) => {
        if (this.selectedCampaignId !== id) return;
        this.campaignResetStatus = res.status;
        this.campaignStatusLoading = false;
      },
      error: (err) => {
        if (this.selectedCampaignId !== id) return;
        this.campaignStatusLoading = false;
        this.campaignStatusError = err?.error?.error || (err?.status === 404 ? 'בדיקת זמינות האיפוס אינה זמינה בשרת. לא בוצע איפוס.' : 'לא ניתן לבדוק כעת את זמינות האיפוס. לא בוצע איפוס.');
      },
    });
  }

  loadVatSetting(): void {
    this.vatSettingLoading = true;
    this.vatSettingError = null;
    this.settingsService.get().subscribe({
      next: (res) => {
        this.vatSettingLoading = false;
        this.masavMode = res.setting?.masav_consolidation_mode ?? null;
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
