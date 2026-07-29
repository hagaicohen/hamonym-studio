import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EntitiesService } from '../../../../core/services/entities.service';

// Phase 4 — Partner Management, Epic 3 (Invite). Public entry point for a
// Partner-invite email link. Three states depending on auth: not logged in
// (choose login/register, both carry ?returnUrl= back here), logged in and
// ready to accept, or already accepted.
@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './accept-invite.component.html',
  styleUrl: './accept-invite.component.css',
})
export class AcceptInviteComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private entitiesService = inject(EntitiesService);

  token = '';
  loading = true;
  loadError: string | null = null;
  entityName = '';
  inviteEmail = '';

  accepting = false;
  accepted = false;
  acceptError: string | null = null;
  acceptedEntityId: string | null = null;

  get isLoggedIn(): boolean { return !!localStorage.getItem('token'); }

  get returnHereUrl(): string {
    return `/accept-invite?token=${this.token}`;
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.loadError = 'קישור ההזמנה אינו תקין.';
      this.loading = false;
      return;
    }
    this.entitiesService.getInvite(this.token).subscribe({
      next: res => {
        this.entityName = res.entityName;
        this.inviteEmail = res.email;
        this.loading = false;
      },
      error: err => {
        this.loadError = err?.status === 410 ? 'ההזמנה כבר נוצלה או פגה תוקפה.' : 'לא נמצאה הזמנה כזו.';
        this.loading = false;
      },
    });
  }

  accept(): void {
    this.accepting = true;
    this.acceptError = '';
    this.entitiesService.acceptInvite(this.token).subscribe({
      next: res => {
        this.accepting = false;
        this.accepted = true;
        this.acceptedEntityId = res.entityId;
      },
      error: err => {
        this.accepting = false;
        this.acceptError = err?.error?.error || 'שגיאה באישור ההזמנה';
      },
    });
  }

  goToPartnerPage(): void {
    if (this.acceptedEntityId) this.router.navigate(['/partners', this.acceptedEntityId, 'builder']);
  }
}
