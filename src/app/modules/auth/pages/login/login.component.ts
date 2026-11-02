import { OrganizationEntryService } from '../../../../core/services/organization-entry.service';
import { LoadingOverlayComponent } from '../../../../shared/components/loading-overlay/loading-overlay.component';

import { Component, NgZone, OnInit } from '@angular/core';

import { environment } from '../../../../../environments/environment';

import { CommonModule } from '@angular/common';

import { inject } from '@angular/core';

import { forkJoin, of } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';

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

  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  private readonly zone = inject(NgZone);
  private organizationEntry = inject(OrganizationEntryService);
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

  private loadDonorRole(token: string): void {
    this.donationService.getMyDonations().pipe(catchError(() => of([]))).subscribe(donations => {
      if (localStorage.getItem('token') === token && donations.length) this.currentContextService.ensureDonorRole();
    });
  }

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
        // Google invokes this callback outside Angular's event handling.
        this.zone.run(() => this.handleGoogleLogin(response?.credential));
      },
    });

    google.accounts.id.renderButton(
      document.getElementById('google-button'),
      { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' },
    );
  }

  handleGoogleLogin(credential: string): void {
    if (this.loading) return;
    if (!credential) {
      this.errorMessage = 'לא התקבל אישור התחברות מ־Google. נסו לבחור את החשבון שוב.';
      return;
    }
    this.loading = true;

    this.errorMessage = '';

    this.http
      .post<any>(
        `${environment.apiUrl}/auth/google`,

        {
          credential,
        },
      )
      .pipe(timeout(30000))
      .subscribe({
        next: (res) => {
          localStorage.setItem('token', res.token);

          localStorage.setItem('user', JSON.stringify(res.user));

          localStorage.setItem('hasEntities', String(res.hasEntities));

          this.currentContextService.setSuperAdmin(!!res.user?.is_super_admin);
          this.currentContextService.setAdminMode(false);

          forkJoin({
            entitiesRes: this.entitiesService.getMyEntities(),
            ambassadorCampaigns: this.ambassadorService.getMyCampaigns(),
          }).pipe(timeout(15000), finalize(() => { this.loading = false; })).subscribe({
            next: ({ entitiesRes, ambassadorCampaigns }) => {
              const entities = entitiesRes.entities || [];

              this.currentContextService.initFromLogin({ entities, ambassadorCampaigns });
              const selected = entities.find((entity: any) => entity.id === this.currentContextService.active()?.context?.id);
              if (selected) {
                this.currentEntityService.currentEntity.set(selected);
                localStorage.setItem('currentEntity', JSON.stringify(selected));
                this.currentEntityService.setRole(selected.role);
              } else {
                this.currentEntityService.currentEntity.set(null);
                localStorage.removeItem('currentEntity');
              }
              this.loadDonorRole(res.token);
              this.loading = false;

              // =========================
              // NAVIGATION FLOW
              // =========================

              if (this.returnUrl) {
                this.router.navigateByUrl(this.returnUrl);

                return;
              }

              if (entities.length > 0) {
                const selectedId = this.currentContextService.active()?.role === 'entity-manager' ? this.currentContextService.active()?.context?.id : null;
                if (selectedId) this.organizationEntry.enter(selectedId);
                this.router.navigate(['/dashboard']);
                return;
              }

              if (ambassadorCampaigns?.length) {
                this.router.navigate(['/campaigns']);

                return;
              }

              this.router.navigate(['/welcome']);
            },
            error: () => {
              this.errorMessage = 'ההתחברות הצליחה, אך טעינת נתוני החשבון נכשלה. נסו להתחבר שוב.';
            },
          });
        },

        error: (err) => {
          this.errorMessage = err?.name === 'TimeoutError'
            ? 'שרת ההתחברות לא השיב בזמן. נסו להתחבר שוב.'
            : 'לא ניתן להשלים את ההתחברות עם Google. נסו שוב.';

          this.loading = false;
        },
      });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    if (this.loading) return;
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
      .pipe(timeout(30000))
      .subscribe({
        next: (res) => {
          localStorage.setItem('token', res.token);

          localStorage.setItem('user', JSON.stringify(res.user));

          localStorage.setItem('hasEntities', String(res.hasEntities));

          this.currentContextService.setSuperAdmin(!!res.user?.is_super_admin);
          this.currentContextService.setAdminMode(false);

          forkJoin({
            entitiesRes: this.entitiesService.getMyEntities(),
            ambassadorCampaigns: this.ambassadorService.getMyCampaigns(),
          }).pipe(timeout(15000), finalize(() => { this.loading = false; })).subscribe({
            next: ({ entitiesRes, ambassadorCampaigns }) => {
              const entities = entitiesRes.entities || [];

              this.currentContextService.initFromLogin({ entities, ambassadorCampaigns });
              const selected = entities.find((entity: any) => entity.id === this.currentContextService.active()?.context?.id);
              if (selected) {
                this.currentEntityService.currentEntity.set(selected);
                localStorage.setItem('currentEntity', JSON.stringify(selected));
                this.currentEntityService.setRole(selected.role);
              } else {
                this.currentEntityService.currentEntity.set(null);
                localStorage.removeItem('currentEntity');
              }
              this.loadDonorRole(res.token);
              this.loading = false;

              // =========================
              // NAVIGATION FLOW
              // =========================

              if (this.returnUrl) {
                this.router.navigateByUrl(this.returnUrl);

                return;
              }

              if (entities.length > 0) {
                const selectedId = this.currentContextService.active()?.role === 'entity-manager' ? this.currentContextService.active()?.context?.id : null;
                if (selectedId) this.organizationEntry.enter(selectedId);
                this.router.navigate(['/dashboard']);
                return;
              }

              if (ambassadorCampaigns?.length) {
                this.router.navigate(['/campaigns']);

                return;
              }

              this.router.navigate(['/welcome']);
            },
            error: () => {
              this.errorMessage = 'ההתחברות הצליחה, אך טעינת נתוני החשבון נכשלה. נסו להתחבר שוב.';
            },
          });
        },

        error: (err) => {
          const backendError = err?.error?.error;

          switch (backendError) {
            case 'Invalid credentials':
              this.errorMessage = 'אימייל או סיסמה שגויים';

              break;

            case 'Email already exists':
              this.errorMessage = 'האימייל כבר קיים במערכת';

              break;

            default:
              this.errorMessage = err?.name === 'TimeoutError'
                ? 'שרת ההתחברות לא השיב בזמן. נסו להתחבר שוב.'
                : 'אירעה שגיאה בהתחברות';
          }

          this.loading = false;
        },
      });
  }
}
