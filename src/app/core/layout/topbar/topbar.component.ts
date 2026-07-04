import { Component, computed, ElementRef, EventEmitter, HostListener, Output, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { CurrentContextService } from '../../services/current-context.service';
import { RoleType } from '../../models/user-context.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.css'],
})
export class TopbarComponent {
  @Output() menuClick = new EventEmitter<void>();

  readonly ctx = inject(CurrentContextService);
  private readonly el = inject(ElementRef);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  dropdownOpen = false;
  readonly alertCount = signal<number>(0);
  photoFailed = false;

  readonly currentUser = signal<{ full_name: string; email: string; picture?: string } | null>(
    this._loadUser(),
  );

  readonly userFullName = computed(() => this.currentUser()?.full_name ?? '');

  readonly userInitials = computed(() => {
    const name = this.userFullName();
    return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  });

  readonly userPhoto = computed(() => this.currentUser()?.picture ?? null);

  private _alertTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private auth: AuthService) {
    effect(() => {
      const active = this.ctx.active();
      const entityId = active?.role === 'entity-manager' ? active.context?.id : null;
      if (this._alertTimer) clearTimeout(this._alertTimer);
      if (entityId) {
        this._alertTimer = setTimeout(() => this._fetchAlertCount(entityId), 2000);
      } else {
        this.alertCount.set(0);
      }
    });
  }

  private _fetchAlertCount(entityId: string): void {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http
      .get<{ count: number }>(`${environment.apiUrl}/api/entities/${entityId}/alert-count`, { headers })
      .subscribe({ next: (r) => this.alertCount.set(r.count), error: () => this.alertCount.set(0) });
  }

  private _loadUser() {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
  }

  switchContext(role: RoleType, contextId: string | null, event: MouseEvent): void {
    event.stopPropagation();
    this.ctx.switchContext(role, contextId);
    this.dropdownOpen = false;

    if (role === 'ambassador') {
      if (this.router.url !== '/campaigns') {
        this.router.navigate(['/campaigns']);
      }
    }
  }

  navigateTo(path: string, event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen = false;
    this.router.navigate([path]);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.dropdownOpen = false;
    }
  }

  logout(): void {
    this.auth.logout();
  }
}
