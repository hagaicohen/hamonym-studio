import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AmbassadorService, Ambassador } from '../../services/ambassador.service';
import { environment } from '../../../../../environments/environment';
import { LucideAngularModule, ChevronRight, ChevronLeft, Eye, User, MessageSquare } from 'lucide-angular';

@Component({
  selector: 'app-ambassador-studio-page',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, LucideAngularModule],
  templateUrl: './ambassador-studio-page.component.html',
  styleUrls: ['./ambassador-studio-page.component.css'],
})
export class AmbassadorStudioPageComponent implements OnInit {
  private route         = inject(ActivatedRoute);
  private router        = inject(Router);
  private http          = inject(HttpClient);
  private ambassadorSvc = inject(AmbassadorService);

  readonly ChevronRight   = ChevronRight;
  readonly ChevronLeft    = ChevronLeft;
  readonly EyeIcon        = Eye;
  readonly UserIcon       = User;
  readonly MessageIcon    = MessageSquare;

  campaignId    = '';
  campaign: any = null;
  ambassador    = signal<Ambassador | null>(null);

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
  };

  readonly steps = [
    { num: 1, label: 'פרופיל', icon: 'user' },
    { num: 2, label: 'תוכן אישי', icon: 'message' },
    { num: 3, label: 'תצוגה מקדימה', icon: 'eye' },
  ];

  ngOnInit(): void {
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    const token = localStorage.getItem('token') ?? '';

    this.http.get<{ ambassador: any }>(
      `${environment.apiUrl}/api/campaigns/${this.campaignId}/my-ambassador-record`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).subscribe({
      next: (res) => {
        const r = res.ambassador;
        this.campaign = r.campaign ?? null;
        const ambassador: Ambassador = {
          id:              r.id,
          campaignId:      r.campaign_id,
          fullName:        r.full_name,
          phone:           r.phone       ?? null,
          email:           r.email       ?? null,
          goalAmount:      r.goal_amount != null ? Number(r.goal_amount) : null,
          personalMessage: r.personal_message ?? '',
          personalTitle:   r.personal_title   ?? '',
          status:          r.status,
          slug:            r.slug,
          raisedOnline:    0,
          raisedManual:    0,
          raisedTotal:     0,
          donorCount:      0,
          createdAt:       r.created_at,
          deactivatedAt:   r.deactivated_at ?? null,
        };
        this.ambassador.set(ambassador);
        this.draft = {
          fullName:        ambassador.fullName,
          phone:           ambassador.phone           ?? '',
          email:           ambassador.email           ?? '',
          personalTitle:   ambassador.personalTitle   ?? '',
          personalMessage: ambassador.personalMessage ?? '',
          goalAmount:      ambassador.goalAmount,
        };
        this.isLoading = false;
      },
      error: () => {
        this.errorMsg = 'לא נמצאה רשומת שגריר עבור קמפיין זה';
        this.isLoading = false;
      },
    });
  }

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
    if (!this.ambassador()) return;
    this.isSaving = true;
    const token = localStorage.getItem('token') ?? '';
    this.http.patch<{ ambassador: any }>(
      `${environment.apiUrl}/api/campaigns/${this.campaignId}/my-ambassador-record`,
      {
        full_name:        this.draft.fullName,
        phone:            this.draft.phone || null,
        email:            this.draft.email || null,
        personal_message: this.draft.personalMessage,
        personal_title:   this.draft.personalTitle || null,
        goal_amount:      this.draft.goalAmount,
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
        } : a);
        this.isSaving = false;
        this.saved    = true;
        setTimeout(() => this.saved = false, 2500);
        onDone?.();
      },
      error: () => {
        this.isSaving = false;
        this.errorMsg = 'שגיאה בשמירה';
      },
    });
  }

  back(): void {
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
    return Math.min(100, Math.round((amb.raisedTotal / this.draft.goalAmount) * 100));
  }
}
