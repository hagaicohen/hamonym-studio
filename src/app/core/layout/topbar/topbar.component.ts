import { Component, computed, ElementRef, EventEmitter, HostListener, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CurrentContextService } from '../../services/current-context.service';
import { RoleType } from '../../models/user-context.model';

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

  dropdownOpen = false;

  readonly currentUser = signal<{ full_name: string; email: string; picture?: string } | null>(
    this._loadUser(),
  );

  readonly userFullName = computed(() => this.currentUser()?.full_name ?? '');

  readonly userInitials = computed(() => {
    const name = this.userFullName();
    return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  });

  readonly userPhoto = computed(() => this.currentUser()?.picture ?? null);

  constructor(private auth: AuthService) {}

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
