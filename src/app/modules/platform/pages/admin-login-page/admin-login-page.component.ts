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
  loading = false;
  errorMessage = '';

  ngOnInit(): void {
    // Already holding a super-admin session on this browser — skip straight in.
    if (localStorage.getItem('token') && localStorage.getItem('isSuperAdmin') === 'true') {
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
        if (!res.user?.is_super_admin) {
          this.errorMessage = 'החשבון הזה אינו מוגדר כמנהל פלטפורמה';
          this.loading = false;
          return;
        }

        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));

        this.ctx.setSuperAdmin(true);
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
