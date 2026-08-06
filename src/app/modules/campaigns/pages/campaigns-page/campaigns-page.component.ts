import { Component, inject, OnInit, OnDestroy, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CampaignApiService } from '../../services/campaign-api.service';
import { AmbassadorService, AmbassadorCampaignSummary } from '../../services/ambassador.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { LucideAngularModule, Trash2, Eye, EyeOff, Users, Pencil, Link, Sparkles } from 'lucide-angular';
import { FUNDING_TYPE_LABELS } from '../../services/campaign-studio-state.service';

@Component({
  selector: 'app-campaigns-page',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './campaigns-page.component.html',
  styleUrls: ['./campaigns-page.component.css'],
})
export class CampaignsPageComponent implements OnInit, OnDestroy {
  viewMode: 'grid' | 'list' = 'grid';
  campaigns: any[] = [];
  isLoading  = true;
  deletingId: string | null = null;
  hidingId:   string | null = null;

  private dataSub?: Subscription;

  readonly TrashIcon  = Trash2;
  readonly EyeIcon    = Eye;
  readonly EyeOffIcon = EyeOff;
  readonly UsersIcon  = Users;
  readonly EditIcon   = Pencil;
  readonly LinkIcon   = Link;
  readonly SparklesIcon = Sparkles;

  confirmModal: { id: string; title: string; type: 'delete-draft' | 'hide-campaign' } | null = null;

  // Card redesign 2026-08-05 — the card is a gateway into the Campaign
  // Dashboard (root of all business actions on a campaign, see
  // docs/CAMPAIGN_MANAGEMENT_DASHBOARD_SPEC.md), not a panel of 5 competing
  // buttons. Whole card + a primary button both lead to Dashboard; the "AI
  // analyze" action is deliberately NOT in the "⋯" menu — it already lives
  // in the Builder topbar, adding a 3rd home for the same feature would be
  // duplication, not relocation.
  openMenuId: string | null = null;

  manageCampaign(id: string): void {
    this.router.navigate(['/campaigns', id, 'dashboard']);
  }

  toggleMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.openMenuId = this.openMenuId === id ? null : id;
  }

  closeMenu(): void {
    this.openMenuId = null;
  }

  ambassadorCampaigns: AmbassadorCampaignSummary[] = [];

  private router         = inject(Router);
  private campaignApi    = inject(CampaignApiService);
  private ambassadorSvc  = inject(AmbassadorService);
  private loader         = inject(AppLoaderService);
  private currentContext = inject(CurrentContextService);

  constructor() {
    // Re-load data whenever the active context changes (e.g. topbar entity/role switch)
    effect(() => {
      const active = this.currentContext.active();
      const isAmb = active?.role === 'ambassador';
      const entityId = active?.role === 'entity-manager' ? active.context?.id : undefined;
      untracked(() => {
        this.dataSub?.unsubscribe();
        this.isLoading          = true;
        this.ambassadorCampaigns = [];
        this.campaigns           = [];
        this.loader.show();

        if (isAmb) {
          this.dataSub = this.ambassadorSvc.getMyCampaigns().subscribe({
            next: (data) => { this.ambassadorCampaigns = data; this.isLoading = false; this.loader.hide(); },
            error: ()    => { this.isLoading = false; this.loader.hide(); },
          });
        } else {
          this.dataSub = this.campaignApi.list(entityId).subscribe({
            next: (data) => { this.campaigns = data; this.isLoading = false; this.loader.hide(); },
            error: ()    => { this.isLoading = false; this.loader.hide(); },
          });
        }
      });
    });
  }

  get isAmbassadorMode(): boolean {
    return this.currentContext.active()?.role === 'ambassador';
  }

  get isAmbassador(): boolean {
    return this.isAmbassadorMode;
  }

  private ambassadorCampaignIds(): Set<string> {
    const group = this.currentContext.roles().find(g => g.role === 'ambassador');
    return new Set(group?.contexts.map(c => c.id) ?? []);
  }

  private hasEntityManagerRole(): boolean {
    return this.currentContext.roles().some(g => g.role === 'entity-manager');
  }

  ngOnInit(): void {}

  ngOnDestroy(): void { this.dataSub?.unsubscribe(); }

  get drafts(): any[] {
    return this.campaigns.filter(c => c.status === 'draft');
  }

  get activeCampaigns(): any[] {
    return this.campaigns.filter(c => c.status !== 'draft');
  }

  // Video-hero campaigns have no coverImageUrl — fall back to the YouTube
  // thumbnail so the card isn't blank.
  cardCoverUrl(c: any): string | null {
    if (c.coverImageUrl) return c.coverImageUrl;
    if (!c.videoUrl) return null;
    const patterns = [/youtube\.com\/watch\?v=([^&]+)/, /youtu\.be\/([^?]+)/, /youtube\.com\/embed\/([^?]+)/];
    for (const p of patterns) {
      const m = c.videoUrl.match(p);
      if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
    }
    return null;
  }

  openDeleteModal(event: Event, id: string, title: string): void {
    event.stopPropagation();
    this.confirmModal = { id, title: title || 'ללא כותרת', type: 'delete-draft' };
  }

  openHideModal(event: Event, c: any): void {
    event.stopPropagation();
    this.confirmModal = { id: c.id, title: c.title || 'ללא כותרת', type: 'hide-campaign' };
  }

  closeModal(): void {
    this.confirmModal = null;
  }

  confirmAction(): void {
    if (!this.confirmModal) return;
    const { id, type } = this.confirmModal;
    this.confirmModal = null;

    if (type === 'delete-draft') {
      this.deletingId = id;
      this.campaignApi.delete(id).subscribe({
        next: () => {
          this.campaigns  = this.campaigns.filter(c => c.id !== id);
          this.deletingId = null;
        },
        error: () => { this.deletingId = null; },
      });
    } else {
      this.hidingId = id;
      this.campaignApi.setVisibility(id, true).subscribe({
        next: () => {
          const c = this.campaigns.find(x => x.id === id);
          if (c) c.isHidden = true;
          this.hidingId = null;
        },
        error: () => { this.hidingId = null; },
      });
    }
  }

  unhide(event: Event, c: any): void {
    event.stopPropagation();
    this.hidingId = c.id;
    this.campaignApi.setVisibility(c.id, false).subscribe({
      next: () => {
        c.isHidden  = false;
        this.hidingId = null;
      },
      error: () => { this.hidingId = null; },
    });
  }

  createCampaign(): void {
    this.router.navigate(['/campaigns/create']);
  }

  createCampaignWithAi(): void {
    this.router.navigate(['/campaigns/create/ai']);
  }

  openAmbassadorStudio(id: string): void {
    this.router.navigate(['/campaigns', id, 'ambassador-studio']);
  }

  editCampaign(id: string): void {
    if (!this.hasEntityManagerRole() && this.ambassadorCampaignIds().has(id)) {
      this.router.navigate(['/campaigns', id, 'ambassador-studio']);
    } else {
      this.router.navigate(['/campaigns', id, 'edit']);
    }
  }

  viewCampaign(slug: string): void {
    this.router.navigate(['/campaigns', slug, 'view']);
  }

  openReports(id: string): void {
    this.router.navigate(['/reports'], { queryParams: { campaignId: id } });
  }

  viewMyAmbassadorPage(c: AmbassadorCampaignSummary): void {
    if (c.ambassadorSlug) {
      this.router.navigate(['/campaigns', c.slug, c.ambassadorSlug]);
    } else {
      this.router.navigate(['/campaigns', c.slug, 'view']);
    }
  }

  viewAmbassadors(id: string): void {
    this.router.navigate(['/campaigns', id, 'ambassadors']);
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft:     'טיוטה',
      published: 'פעיל',
      paused:    'מושהה',
      ended:     'הסתיים',
    };
    return labels[status] ?? status;
  }

  fundingLabel(type: string): string {
    return FUNDING_TYPE_LABELS[type as keyof typeof FUNDING_TYPE_LABELS] ?? type;
  }

  progressPercent(campaign: any): number {
    if (!campaign.targetAmount) return 0;
    return Math.min(100, Math.round(((campaign.currentAmount ?? 0) / campaign.targetAmount) * 100));
  }

  daysRemaining(endDate: string): number {
    if (!endDate) return 0;
    const diff = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  fmtDate(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  }

  advisingId: string | null = null;
  advisorCampaignTitle = '';
  advisorResult: { summary: string; strengths: string[]; tasks: { topic: string; severity: string; explanation: string; task: string }[] } | null = null;
  advisorError = '';

  analyzeCampaign(event: Event, c: any): void {
    event.stopPropagation();
    if (this.advisingId) return;
    this.advisingId = c.id;
    this.advisorCampaignTitle = c.title || 'ללא כותרת';
    this.advisorError = '';
    this.advisorResult = null;
    this.campaignApi.advise(c.id).subscribe({
      next: (result) => { this.advisorResult = result; this.advisingId = null; },
      error: (err) => { this.advisorError = err.error?.error || 'שגיאה בקבלת המלצות'; this.advisingId = null; },
    });
  }

  closeAdvisor(): void {
    this.advisorResult = null;
    this.advisorError = '';
  }
}
