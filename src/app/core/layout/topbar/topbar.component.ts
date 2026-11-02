import { OrganizationEntryService } from '../../services/organization-entry.service';
import { Component, computed, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CurrentEntityService } from '../../services/current-entity.service';
import { CommonModule } from '@angular/common';
import { Params, Router } from '@angular/router';
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
export class TopbarComponent implements OnDestroy {
  private currentEntity = inject(CurrentEntityService);
  private selection?: Subscription;
  switchError = '';
  switchingId: string | null = null;
  ngOnDestroy(): void { this.selection?.unsubscribe(); }
  @Input() publicPage = false;
  @ViewChild('profileToggle') private profileToggle?: ElementRef<HTMLButtonElement>;
  @Output() menuClick = new EventEmitter<void>();

  private organizationEntry = inject(OrganizationEntryService);
  readonly ctx = inject(CurrentContextService);
  private readonly el = inject(ElementRef);
  private readonly router = inject(Router);

  dropdownOpen = false;
  photoFailed = false;

  constructor(private auth: AuthService) {}

  get authenticated(): boolean { return !!this.auth.getToken(); }

  login(): void {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  @HostListener('document:keydown.escape')
  closeDropdown(): void {
    if (this.dropdownOpen) {
      this.dropdownOpen = false;
      this.profileToggle?.nativeElement.focus();
    }
  }

  closeOnFocusOut(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) this.dropdownOpen = false;
  }

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
    if (contextId && this.switchingId === contextId) return;
    const changed = role === 'entity-manager' && contextId && (this.ctx.active()?.role !== role || this.ctx.active()?.context?.id !== contextId);
    this.selection?.unsubscribe();
    this.switchingId = null;
    this.switchError = '';
    if (role === 'entity-manager' && contextId) {
      this.switchingId = contextId;
      this.selection = this.currentEntity.selectEntity(contextId).subscribe({
        next: () => {
          this.switchingId = null;
          if (changed) this.organizationEntry.enter(contextId);
          this.dropdownOpen = false;
          this.router.navigate(['/dashboard']);
        },
        error: () => {
          this.switchingId = null;
          this.switchError = 'לא ניתן לעבור לעמותה. יש לבדוק הרשאה ולנסות שוב.';
        },
      });
      return;
    }
    this.ctx.switchContext(role, contextId);
    if (changed) this.router.navigate(['/dashboard']);
    this.dropdownOpen = false;

    if (role === 'ambassador') {
      if (this.router.url !== '/campaigns') {
        this.router.navigate(['/campaigns']);
      }
    }

    if (role === 'donor') {
      if (this.router.url !== '/my-donations') {
        this.router.navigate(['/my-donations']);
      }
    }
  }

  async navigateTo(path: string, event: MouseEvent, queryParams?: Params): Promise<void> {
    event.stopPropagation();
    this.selection?.unsubscribe();
    this.switchingId = null;
    this.switchError = '';
    try {
      const navigated = await (queryParams
        ? this.router.navigate([path], { queryParams })
        : this.router.navigate([path]));
      if (navigated) this.dropdownOpen = false;
      else this.switchError = 'לא ניתן לפתוח את העמוד. יש לנסות שוב.';
    } catch {
      this.switchError = 'לא ניתן לפתוח את העמוד. יש לנסות שוב.';
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.dropdownOpen = false;
    }
  }

  logout(): void {
    this.auth.logout('/');
  }
}
