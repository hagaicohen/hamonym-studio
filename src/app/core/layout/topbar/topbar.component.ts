import { Component, computed, ElementRef, EventEmitter, HostListener, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CurrentContextService } from '../../services/current-context.service';
import { RoleType } from '../../models/user-context.model';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, NotificationBellComponent],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.css'],
})
export class TopbarComponent {
  @Output() menuClick = new EventEmitter<void>();

  readonly ctx = inject(CurrentContextService);
  private readonly el = inject(ElementRef);
  private readonly router = inject(Router);

  dropdownOpen = false;
  photoFailed = false;

  constructor(private auth: AuthService) {}

  readonly currentUser = this.auth.currentUser;

  readonly userFullName = computed(() => this.currentUser()?.full_name ?? '');

  readonly userInitials = computed(() => {
    const name = this.userFullName();
    return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  });

  readonly userPhoto = computed(() => this.currentUser()?.picture ?? null);

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
