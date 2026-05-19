import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component.js';

import { Component, OnInit } from '@angular/core';

import { environment } from '../../../../../environments/environment.js';

import { CommonModule } from '@angular/common';

import { inject } from '@angular/core';

import { EntitiesService } from '../../../../core/services/entities.service';

import { CurrentEntityService } from '../../../../core/services/current-entity.service';

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

      email: [
        '',
        [
          Validators.required,
          Validators.email
        ]
      ],

      password: [
        '',
        [
          Validators.required,
          Validators.minLength(6)
        ]
      ],
    });
  }

  private entitiesService =
    inject(EntitiesService);

  private currentEntityService =
    inject(CurrentEntityService);

  ngOnInit(): void {

    google.accounts.id.initialize({

      client_id:
        environment.googleClientId,

      callback: (response: any) => {

        this.handleGoogleLogin(
          response.credential
        );
      },
    });

    google.accounts.id.renderButton(

      document.getElementById(
        'google-button'
      ),

      {
        theme: 'outline',

        size: 'large',

        shape: 'pill',

        text: 'signin_with',
      },
    );
  }

  handleGoogleLogin(
    credential: string
  ): void {

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

          localStorage.setItem(
            'token',
            res.token
          );

          localStorage.setItem(
            'user',
            JSON.stringify(res.user)
          );

          localStorage.setItem(
            'hasEntities',
            String(res.hasEntities)
          );

          this.entitiesService
            .getMyEntities()
            .subscribe({

              next: (entitiesRes) => {

                const entities =
                  entitiesRes.entities || [];

                if (entities.length > 0) {

                  const entity =
                    entities[0];

                  localStorage.setItem(

                    'currentEntity',

                    JSON.stringify({

                      id:
                        entity.id,

                      display_name:
                        entity.display_name,

                      entity_type:
                        entity.entity_type,

                      status:
                        entity.status,
                    }),
                  );

                  this.currentEntityService
                    .currentEntity
                    .set(entity);

                  this.currentEntityService
                    .currentRole
                    .set(entity.role);
                }

                // =========================
                // NAVIGATION FLOW
                // =========================

                if (res.hasEntities) {

                  this.router.navigate([
                    '/campaigns'
                  ]);

                  return;
                }

                this.router.navigate([
                  '/organizations'
                ]);
              },
            });
        },

        error: (err) => {

          console.error(err);

          this.errorMessage =
            'אירעה שגיאה בהתחברות עם Google';

          this.loading = false;
        },
      });
  }

  togglePassword(): void {

    this.showPassword =
      !this.showPassword;
  }

  submit(): void {

    if (this.loginForm.invalid) {

      this.loginForm
        .markAllAsTouched();

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

          localStorage.setItem(
            'token',
            res.token
          );

          localStorage.setItem(
            'user',
            JSON.stringify(res.user)
          );

          localStorage.setItem(
            'hasEntities',
            String(res.hasEntities)
          );

          this.entitiesService
            .getMyEntities()
            .subscribe({

              next: (entitiesRes) => {

                const entities =
                  entitiesRes.entities || [];

                if (entities.length > 0) {

                  const entity =
                    entities[0];

                  localStorage.setItem(

                    'currentEntity',

                    JSON.stringify({

                      id:
                        entity.id,

                      display_name:
                        entity.display_name,

                      entity_type:
                        entity.entity_type,

                      status:
                        entity.status,
                    }),
                  );

                  this.currentEntityService
                    .currentEntity
                    .set(entity);

                  this.currentEntityService
                    .currentRole
                    .set(entity.role);
                }

                // =========================
                // NAVIGATION FLOW
                // =========================

                if (res.hasEntities) {

                  this.router.navigate([
                    '/campaigns'
                  ]);

                  return;
                }

                this.router.navigate([
                  '/organizations'
                ]);
              },
            });
        },

        error: (err) => {

          console.error(err);

          const backendError =
            err?.error?.error;

          switch (backendError) {

            case 'Invalid credentials':

              this.errorMessage =
                'אימייל או סיסמה שגויים';

              break;

            case 'Email already exists':

              this.errorMessage =
                'האימייל כבר קיים במערכת';

              break;

            default:

              this.errorMessage =
                'אירעה שגיאה בהתחברות';
          }

          this.loading = false;
        },
      });
  }
}