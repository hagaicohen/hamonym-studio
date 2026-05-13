import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component.js';

import { Component, OnInit } from '@angular/core';

import { environment } from '../../../../../environments/environment.js';

import { CommonModule } from '@angular/common';

import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Router, RouterLink } from '@angular/router';

import { HttpClient, HttpClientModule } from '@angular/common/http';

declare const google: any;

@Component({
  selector: 'app-login',

  standalone: true,

  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    HttpClientModule,
    LoadingOverlayComponent,
  ],

  templateUrl: './login.component.html',

  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;

  showPassword = false;

  loading = false;

  errorMessage = '';

  constructor(
    private fb: FormBuilder,

    private http: HttpClient,

    private router: Router,
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],

      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit(): void {
    google.accounts.id.initialize({
      client_id: environment.googleClientId,

      callback: (response: any) => {
        this.handleGoogleLogin(response.credential);
      },
    });

    google.accounts.id.renderButton(
      document.getElementById('google-button'),

      {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
      },
    );
  }

  handleGoogleLogin(credential: string): void {
    this.loading = true;

    this.errorMessage = '';

    this.http
      .post<any>(
        `${environment.apiUrl}/auth/google`,

        {
          credential,
        },
      )
      .subscribe({
        next: (res) => {
          localStorage.setItem('token', res.token);

          localStorage.setItem('user', JSON.stringify(res.user));

          localStorage.setItem('hasEntities', String(res.hasEntities));

          if (res.hasEntities) {
            this.router.navigate(['/dashboard']);

            return;
          }

          this.router.navigate(['/campaigns']);
        },

        error: (err) => {
          console.error(err);

          this.errorMessage = 'אירעה שגיאה בהתחברות עם Google';

          this.loading = false;
        },
      });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();

      return;
    }

    this.loading = true;

    this.errorMessage = '';

    this.http
      .post<any>(
        `${environment.apiUrl}/auth/login`,

        this.loginForm.value,
      )
      .subscribe({
        next: (res) => {
          localStorage.setItem('token', res.token);

          localStorage.setItem('user', JSON.stringify(res.user));

          const user = res.user;

          if (!user.role) {
            this.router.navigate(['/onboarding']);

            return;
          }

          if (user.role === 'organization' || user.role === 'fundraiser') {
            this.router.navigate(['/campaigns']);

            return;
          }

          this.router.navigate(['/dashboard']);
        },

        error: (err) => {
          console.error(err);

          const backendError = err?.error?.error;

          switch (backendError) {
            case 'Invalid credentials':
              this.errorMessage = 'אימייל או סיסמה שגויים';

              break;

            case 'Email already exists':
              this.errorMessage = 'האימייל כבר קיים במערכת';

              break;

            default:
              this.errorMessage = 'אירעה שגיאה בהתחברות';
          }

          this.loading = false;
        },
      });
  }
}
