import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component.js';

import { Component, OnInit } from '@angular/core';

import { environment } from '../../../../../environments/environment.js';

import { CommonModule } from '@angular/common';

import { inject } from '@angular/core';

import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { EntitiesService } from '../../../../core/services/entities.service';

import { CurrentEntityService } from '../../../../core/services/current-entity.service';

import { CurrentContextService } from '../../../../core/services/current-context.service';

import { AmbassadorService } from '../../../campaigns/services/ambassador.service';

import { DonationService } from '../../../campaigns/services/donation.service';

import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';

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

  // Populated from ?returnUrl= (e.g. arriving via a Partner invite link) —
  // additive, existing hardcoded /campaigns|/welcome navigation below is
  // untouched when absent.
  private returnUrl: string | null = null;

  constructor(
    private fb: FormBuilder,

    private http: HttpClient,

    private router: Router,

    private route: ActivatedRoute,
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],

      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  private entitiesService = inject(EntitiesService);

  private currentEntityService = inject(CurrentEntityService);

  private currentContextService = inject(CurrentContextService);

  private ambassadorService = inject(AmbassadorService);

  private donationService = inject(DonationService);

  ngOnInit(): void {
    this._initGoogle();

    const qp = this.route.snapshot.queryParamMap;
    this.returnUrl = qp.get('returnUrl');
    const email = qp.get('email');
    if (email) this.loginForm.patchValue({ email });
  }

  private _initGoogle(): void {
    if (typeof (window as any)['google'] !== 'undefined' && (window as any)['google']?.accounts?.id) {
      this._renderGoogleButton();
    } else {
      const script = document.querySelector('script[src*="accounts.google.com"]');
      if (script) {
        script.addEventListener('load', () => this._renderGoogleButton());
      }
    }
  }

  private _renderGoogleButton(): void {
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: any) => {
        this.handleGoogleLogin(response.credential);
      },
    });

    google.accounts.id.renderButton(
      document.getElementById('google-button'),
      { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' },
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

          this.currentContextService.setSuperAdmin(!!res.user?.is_super_admin);
          this.currentContextService.setAdminMode(false);

          forkJoin({
            entitiesRes: this.entitiesService.getMyEntities().pipe(catchError(() => of({ entities: [] }))),
            ambassadorCampaigns: this.ambassadorService.getMyCampaigns(),
            donations: this.donationService.getMyDonations().pipe(catchError(() => of([]))),
          }).subscribe({
            next: ({ entitiesRes, ambassadorCampaigns, donations }) => {
              const entities = entitiesRes.entities || [];

              if (entities.length > 0) {
                const entity = entities[0];

                localStorage.setItem(
                  'currentEntity',

                  JSON.stringify({
                    id: entity.id,

                    display_name: entity.display_name,

                    entity_type: entity.entity_type,

                    status: entity.status,
                  }),
                );

                this.currentEntityService.currentEntity.set(entity);

                this.currentEntityService.currentRole.set(entity.role);
              }

              this.currentContextService.initFromLogin({ entities, ambassadorCampaigns, isDonor: donations.length > 0 });

              // =========================
              // NAVIGATION FLOW
              // =========================

              if (this.returnUrl) {
                this.router.navigateByUrl(this.returnUrl);

                return;
              }

              if (res.hasEntities || ambassadorCampaigns?.length) {
                this.router.navigate(['/campaigns']);

                return;
              }

              this.router.navigate(['/welcome']);
            },
          });
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

          localStorage.setItem('hasEntities', String(res.hasEntities));

          this.currentContextService.setSuperAdmin(!!res.user?.is_super_admin);
          this.currentContextService.setAdminMode(false);

          forkJoin({
            entitiesRes: this.entitiesService.getMyEntities().pipe(catchError(() => of({ entities: [] }))),
            ambassadorCampaigns: this.ambassadorService.getMyCampaigns(),
            donations: this.donationService.getMyDonations().pipe(catchError(() => of([]))),
          }).subscribe({
            next: ({ entitiesRes, ambassadorCampaigns, donations }) => {
              const entities = entitiesRes.entities || [];

              if (entities.length > 0) {
                const entity = entities[0];

                localStorage.setItem(
                  'currentEntity',

                  JSON.stringify({
                    id: entity.id,

                    display_name: entity.display_name,

                    entity_type: entity.entity_type,

                    status: entity.status,
                  }),
                );

                this.currentEntityService.currentEntity.set(entity);

                this.currentEntityService.currentRole.set(entity.role);
              }

              this.currentContextService.initFromLogin({ entities, ambassadorCampaigns, isDonor: donations.length > 0 });

              // =========================
              // NAVIGATION FLOW
              // =========================

              if (this.returnUrl) {
                this.router.navigateByUrl(this.returnUrl);

                return;
              }

              if (res.hasEntities || ambassadorCampaigns?.length) {
                this.router.navigate(['/campaigns']);

                return;
              }

              this.router.navigate(['/welcome']);
            },
          });
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
