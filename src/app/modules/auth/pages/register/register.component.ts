import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { AuthService } from '../../../../core/services/auth.service';
import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    LoadingOverlayComponent,
  ],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
})
export class RegisterComponent implements OnInit {
  form: FormGroup;

  loading = false;

  errorMessage = '';

  showPassword = false;

  showConfirmPassword = false;

  private returnUrl: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    this.form = this.fb.group({
      fullName: ['', Validators.required],

      email: ['', [Validators.required, Validators.email]],

      password: ['', [Validators.required, Validators.minLength(6)]],

      confirmPassword: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    // Arriving from the donation-success "create an account" prompt — the
    // donor already typed these, so prefill instead of asking again.
    const qp = this.route.snapshot.queryParamMap;
    const email = qp.get('email');
    const name = qp.get('name');
    this.returnUrl = qp.get('returnUrl');

    if (email) this.form.patchValue({ email });
    if (name) this.form.patchValue({ fullName: name });
  }

  // Carries the donor through to Login with the same context they arrived
  // with here — returnUrl (so Login still lands them back on /my-donations,
  // not its own default) and whatever email they typed (login.component.ts
  // already reads ?email= and prefills it — see its ngOnInit). Read from
  // this.form.value.email rather than the original query param, so it
  // reflects what they actually typed if they edited it before hitting the
  // "email already exists" error.
  get loginQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.returnUrl) params['returnUrl'] = this.returnUrl;
    const email = this.form.get('email')?.value;
    if (email) params['email'] = email;
    return params;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      return;
    }

    if (this.form.value.password !== this.form.value.confirmPassword) {
      this.errorMessage = 'הסיסמאות אינן תואמות';

      return;
    }

    this.loading = true;

    this.errorMessage = '';

    this.authService
      .register({
        full_name: this.form.value.fullName,

        email: this.form.value.email,

        password: this.form.value.password,
      })
      .subscribe({
        next: (response) => {
          this.loading = false;

          if (response.token) {
            this.authService.saveToken(response.token);
          }

          this.router.navigateByUrl(this.returnUrl || '/onboarding');
        },

        error: (error) => {
          this.loading = false;

          const backendError = error?.error?.error;

          // Matches login.component.ts's own translation of this same
          // backend error string, and points the donor at the "להתחברות"
          // link below (now carrying returnUrl+email — see loginQueryParams)
          // instead of leaving them stuck on a form they can't submit.
          this.errorMessage =
            backendError === 'Email already exists'
              ? 'האימייל הזה כבר רשום במערכת — אפשר להתחבר עם החשבון הקיים'
              : backendError || 'שגיאה ביצירת החשבון';
        },
      });
  }
}
