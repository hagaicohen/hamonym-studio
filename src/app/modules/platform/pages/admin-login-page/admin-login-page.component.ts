import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { CurrentContextService } from '../../../../core/services/current-context.service';

@Component({
  selector: 'app-admin-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login-page.component.html',
  styleUrl: './admin-login-page.component.css',
})
export class AdminLoginPageComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private ctx = inject(CurrentContextService);

  email = '';
  password = '';
  showPassword = false;
  loading = false;
  errorMessage = '';

  ngOnInit(): void {
    // Already holding a platform-admin session on this browser (full or scoped) — skip straight in.
    const hasToken = !!localStorage.getItem('token');
    const isFullAdmin = localStorage.getItem('isSuperAdmin') === 'true';
    const hasScopedAccess = this.ctx.platformPermissions().length > 0;
    if (hasToken && (isFullAdmin || hasScopedAccess)) {
      this.ctx.setAdminMode(true);
      this.router.navigate(['/platform']);
    }
  }

  submit(): void {
    if (!this.email || !this.password) return;

    this.loading = true;
    this.errorMessage = '';

    this.http.post<any>(`${environment.apiUrl}/auth/login`, { email: this.email, password: this.password }).subscribe({
      next: (res) => {
        const permissions: string[] = res.user?.platform_permissions || [];
        if (!res.user?.is_super_admin && permissions.length === 0) {
          this.errorMessage = 'החשבון הזה אינו מוגדר כמנהל פלטפורמה';
          this.loading = false;
          return;
        }

        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));

        this.ctx.setSuperAdmin(!!res.user?.is_super_admin);
        this.ctx.setPlatformPermissions(permissions);
        this.ctx.setAdminMode(true);

        this.router.navigate(['/platform']);
      },
      error: (err) => {
        this.errorMessage = err?.error?.error === 'Invalid credentials'
          ? 'אימייל או סיסמה שגויים'
          : 'אירעה שגיאה בהתחברות';
        this.loading = false;
      },
    });
  }
}
