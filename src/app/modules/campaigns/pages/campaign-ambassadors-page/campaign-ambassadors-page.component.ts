import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAngularModule,
  Users, Eye, EyeOff, Trash2, ChevronRight,
} from 'lucide-angular';
import { AmbassadorService, Ambassador } from '../../services/ambassador.service';
import { CampaignApiService } from '../../services/campaign-api.service';

@Component({
  selector: 'app-campaign-ambassadors-page',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './campaign-ambassadors-page.component.html',
  styleUrls: ['./campaign-ambassadors-page.component.css'],
})
export class CampaignAmbassadorsPageComponent implements OnInit {
  private route        = inject(ActivatedRoute);
  private router       = inject(Router);
  private ambassadorSvc = inject(AmbassadorService);
  private campaignApi  = inject(CampaignApiService);

  readonly UsersIcon   = Users;
  readonly EyeIcon     = Eye;
  readonly EyeOffIcon  = EyeOff;
  readonly TrashIcon   = Trash2;
  readonly BackIcon    = ChevronRight;

  campaignId    = '';
  campaignTitle = '';
  ambassadors: Ambassador[] = [];
  isLoading   = true;
  togglingId: string | null = null;
  deletingId: string | null = null;
  confirmDelete: { id: string; name: string } | null = null;

  ngOnInit(): void {
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    this.campaignApi.getById(this.campaignId).subscribe({
      next: (c) => { this.campaignTitle = c.title; },
      error: () => {},
    });
    this.loadAmbassadors();
  }

  loadAmbassadors(): void {
    this.isLoading = true;
    this.ambassadorSvc.list(this.campaignId).subscribe({
      next: (list) => { this.ambassadors = list; this.isLoading = false; },
      error: ()     => { this.isLoading = false; },
    });
  }

  get stats() { return this.ambassadorSvc.computeStats(this.ambassadors); }
  get hiddenCount(): number { return this.ambassadors.filter(a => a.status === 'inactive').length; }

  toggleStatus(a: Ambassador): void {
    if (this.togglingId) return;
    this.togglingId = a.id;
    const next = a.status === 'active' ? 'inactive' : 'active';
    this.ambassadorSvc.setStatus(a.id, next).subscribe({
      next: (updated) => {
        const i = this.ambassadors.findIndex(x => x.id === updated.id);
        if (i !== -1) this.ambassadors = [
          ...this.ambassadors.slice(0, i),
          updated,
          ...this.ambassadors.slice(i + 1),
        ];
        this.togglingId = null;
      },
      error: () => { this.togglingId = null; },
    });
  }

  openDeleteConfirm(a: Ambassador): void { this.confirmDelete = { id: a.id, name: a.fullName }; }
  cancelDelete(): void { this.confirmDelete = null; }

  confirmDeleteAction(): void {
    if (!this.confirmDelete) return;
    const { id } = this.confirmDelete;
    this.confirmDelete = null;
    this.deletingId = id;
    this.ambassadorSvc.delete(id).subscribe({
      next: () => { this.ambassadors = this.ambassadors.filter(a => a.id !== id); this.deletingId = null; },
      error: () => { this.deletingId = null; },
    });
  }

  back(): void { this.router.navigate(['/campaigns']); }

  fmtMoney(n: number): string { return '₪' + n.toLocaleString('he-IL'); }
  initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
