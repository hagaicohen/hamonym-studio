import { AmbassadorFormDrawerComponent } from '../../shared/components/ambassador-form-drawer.component';
import { AuthService } from '../../../../core/services/auth.service';
import { AmbassadorFormFieldsComponent, DEFAULT_AMBASSADOR_SLOGAN } from '../../shared/components/ambassador-form-fields.component';
import { MoneyInputDirective } from '../../../../shared/directives/money-input.directive';
import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AmbassadorService, Ambassador } from '../../services/ambassador.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { environment } from '../../../../../environments/environment';
import { LucideAngularModule, ChevronRight, ChevronLeft, Eye, User, MessageSquare } from 'lucide-angular';
import { AmbassadorSlugFieldComponent } from '../../shared/components/ambassador-slug-field/ambassador-slug-field.component';

@Component({
  selector: 'app-ambassador-studio-page',
  standalone: true,
  imports: [AmbassadorFormDrawerComponent, AmbassadorFormFieldsComponent, CommonModule, FormsModule, MoneyInputDirective, HttpClientModule, LucideAngularModule, AmbassadorSlugFieldComponent],
  templateUrl: './ambassador-studio-page.component.html',
  styleUrls: ['./ambassador-studio-page.component.css'],
})
export class AmbassadorStudioPageComponent implements OnInit {
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private http          = inject(HttpClient);
  private ambassadorSvc = inject(AmbassadorService);
  private loader        = inject(AppLoaderService);

  readonly ChevronRight   = ChevronRight;
  readonly ChevronLeft    = ChevronLeft;
  readonly EyeIcon        = Eye;
  readonly UserIcon       = User;
  readonly MessageIcon    = MessageSquare;

  campaignId    = '';
  ambassadorId = '';
  campaign: any = null;
  ambassador    = signal<Ambassador | null>(null);

  readonly auth = inject(AuthService);
  photoUploading = false;
  private initialDraft = '';
  saveError = '';
  isLoading = true;
  isSaving  = false;
  errorMsg  = '';
  saved     = false;

  currentStep = 1;
  readonly TOTAL_STEPS = 3;

  draft = {
    fullName:        '',
    phone:           '',
    email:           '',
    personalTitle:   '',
    personalMessage: '',
    goalAmount:      null as number | null,
    slug:            '',
    photoUrl:        null as string | null,
  };
  // Pre-existing saved slug always starts available (the slug field
  // component confirms it optimistically on first change without a round
  // trip) — same pattern as the admin CRUD edit drawer.
  slugAvailable = true;

  readonly steps = [
    { num: 1, label: 'פרופיל', icon: 'user' },
    { num: 2, label: 'תוכן אישי', icon: 'message' },
    { num: 3, label: 'תצוגה מקדימה', icon: 'eye' },
  ];

  ngOnInit(): void {
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    this.ambassadorId = this.route.snapshot.queryParamMap.get('ambassadorId') || this.ambassadorId;
    const token = localStorage.getItem('token') ?? '';

    this.http.get<{ ambassador: any }>(
      this.ambassadorId ? `${environment.apiUrl}/api/ambassadors/${this.ambassadorId}` : `${environment.apiUrl}/api/campaigns/${this.campaignId}/my-ambassador-record`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).subscribe({
      next: (res) => {
        const r = res.ambassador;
        if (r.campaign_id !== this.campaignId) { this.errorMsg = 'השגרירות אינה שייכת לקמפיין שנבחר'; this.isLoading = false; this.loader.hide(); return; }
        this.ambassadorId = r.id;
        this.campaign = r.campaign ?? null;
        const ambassador: Ambassador = {
          id:              r.id,
          campaignId:      r.campaign_id,
          fullName:        r.full_name,
          phone:           r.phone       ?? null,
          email:           r.email       ?? null,
          goalAmount:      r.goal_amount != null ? Number(r.goal_amount) : null,
          personalMessage: r.personal_message ?? '',
          photoUrl:        r.photo_url ?? null,
          personalTitle:   r.personal_title   ?? '',
          status:          r.status,
          slug:            r.slug,
          raisedOnline:    Number(r.raised_online) || 0,
          raisedManual:    Number(r.raised_manual) || 0,
          raisedTotal:     Number(r.raised_total) || 0,
          donorCount:      Number(r.donor_count) || 0,
          createdAt:       r.created_at,
          deactivatedAt:   r.deactivated_at ?? null,
        };
        this.ambassador.set(ambassador);
        this.draft = {
          fullName:        ambassador.fullName,
          phone:           ambassador.phone           ?? '',
          email:           ambassador.email           ?? '',
          personalTitle:   ambassador.personalTitle   ?? '',
          personalMessage: ambassador.personalMessage || DEFAULT_AMBASSADOR_SLOGAN,
          goalAmount:      ambassador.goalAmount,
          slug:            ambassador.slug ?? '',
          photoUrl:        ambassador.photoUrl ?? null,
        };
        this.initialDraft = JSON.stringify(this.draft);
        this.isLoading = false;
        this.loader.hide();
      },
      error: () => {
        this.errorMsg = 'לא נמצאה רשומת שגריר עבור קמפיין זה';
        this.isLoading = false;
        this.loader.hide();
      },
    });
  }

  saveAfterEdit(): void { this.save(() => { this.currentStep = 3; }); }

  next(): void {
    if (this.currentStep === 2) {
      this.save(() => {
        if (this.currentStep < this.TOTAL_STEPS) this.currentStep++;
      });
    } else if (this.currentStep < this.TOTAL_STEPS) {
      this.currentStep++;
    }
  }

  prev(): void {
    if (this.currentStep > 1) this.currentStep--;
  }

  save(onDone?: () => void): void {
    if (this.isSaving || this.photoUploading || !this.ambassador() || !this.slugAvailable || !this.draft.fullName.trim()) return;
    this.saveError = '';
    this.isSaving = true;
    const token = localStorage.getItem('token') ?? '';
    this.http.patch<{ ambassador: any }>(
      `${environment.apiUrl}/api/ambassadors/${this.ambassadorId}`,
      {
        full_name:        this.draft.fullName,
        phone:            this.draft.phone || null,
        email:            this.draft.email || null,
        personal_message: this.draft.personalMessage,
        personal_title:   this.draft.personalTitle || null,
        goal_amount:      this.draft.goalAmount,
        ...(this.draft.photoUrl !== this.ambassador()?.photoUrl && this.draft.photoUrl ? {photo_url:this.draft.photoUrl} : {}),
        ...(this.draft.slug !== this.ambassador()?.slug ? {slug:this.draft.slug} : {}),

      },
      { headers: { Authorization: `Bearer ${token}` } }
    ).subscribe({
      next: (res) => {
        const r = res.ambassador;
        this.ambassador.update(a => a ? {
          ...a,
          fullName:        r.full_name,
          phone:           r.phone ?? null,
          email:           r.email ?? null,
          personalMessage: r.personal_message ?? '',
          personalTitle:   r.personal_title   ?? '',
          goalAmount:      r.goal_amount != null ? Number(r.goal_amount) : null,
          slug:            r.slug ?? a.slug,
          photoUrl:        r.photo_url ?? a.photoUrl,
        } : a);
        this.isSaving = false;
        this.initialDraft = JSON.stringify(this.draft);
        this.saved    = true;
        setTimeout(() => this.saved = false, 2500);
        onDone?.();
      },
      error: (err) => {
        this.isSaving = false;
        this.saveError = err?.error?.error || 'שגיאה בשמירה';
      },
    });
  }

  goalAboveCampaignGoal(): boolean {
    const target = this.campaign?.target_amount ?? 0;
    return !!this.draft.goalAmount && target > 0 && this.draft.goalAmount > target;
  }

  reload(): void {
    this.isLoading = true;
    this.errorMsg  = '';
    this.loader.show();
    this.ngOnInit();
  }

  back(): void {
    if (this.isSaving || this.photoUploading) return;
    if (!this.errorMsg && this.initialDraft && this.initialDraft !== JSON.stringify(this.draft) && !window.confirm('לצאת בלי לשמור את השינויים?')) return;
    this.router.navigate(['/campaigns']);
  }

  shareUrl(): string {
    const amb = this.ambassador();
    const slug = this.campaign?.slug;
    if (!amb || !slug) return '';
    return `${window.location.origin}/campaigns/${slug}/${amb.slug}`;
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.shareUrl()).catch(() => {});
  }

  goalPct(amb: Ambassador): number {
    if (!this.draft.goalAmount || !amb.raisedTotal) return 0;
    return Math.round((amb.raisedTotal / this.draft.goalAmount) * 100);
  }
}
