import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css',
})
export class ResetPasswordComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);

  token = '';
  password = '';
  confirmPassword = '';
  loading = false;
  success = false;
  errorMessage = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.errorMessage = 'קישור לא תקין';
    }
  }

  submit(): void {
    this.errorMessage = '';

    if (this.password.length < 8) {
      this.errorMessage = 'הסיסמה חייבת להכיל לפחות 8 תווים';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'הסיסמאות אינן תואמות';
      return;
    }

    this.loading = true;
    this.http.post<any>(`${environment.apiUrl}/auth/reset-password`, {
      token: this.token,
      newPassword: this.password,
    }).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.error === 'Invalid or expired token'
          ? 'הקישור אינו תקין או שפג תוקפו — יש לבקש קישור חדש'
          : 'אירעה שגיאה, נסו שוב';
      },
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
