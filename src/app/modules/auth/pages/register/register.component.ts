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

          this.errorMessage = error?.error?.error || 'שגיאה ביצירת החשבון';
        },
      });
  }
}
