import { Injectable, inject, signal } from '@angular/core';
import { Observable, defer, forkJoin, of, throwError } from 'rxjs';
import { finalize, map, switchMap, tap } from 'rxjs/operators';
import { EntitiesService } from '../../../core/services/entities.service';
import { BillingService } from './billing.service';

export type BillingPaymentMethod = 'credit-card' | 'masav';

export interface OrganizationRegistrationState {
  // Set once the draft/entity row exists in the DB — null until the first
  // save (draft or final). Every save after that is an update to this id
  // instead of creating a second entity.
  entityId: string | null;

  // STEP 1

  entityType: string;

  organizationName: string;

  organizationNumber: string;

  primaryCategory: string;

  fullName: string;

  phone: string;

  email: string;

  certificateFileName: string;

  certificateFileUrl: string;

  section46FileName: string;

  section46FileUrl: string;

  selectedCategories: string[];

  certificateFile: File | null;

  section46File: File | null;

  // STEP 2

  displayName: string;

  organizationDescription: string;

  website: string;

  selectedCampaignTypes: string[];

  logoPreview: string;

  logoFile: File | null;

  // STEP 3

  monthlyGoal: string;

  yearlyGoal: string;

  // STEP 4

  provider: string;

  terminalNumber: string;

  apiUsername: string;

  apiPassword: string;

  useExistingTerminal: boolean;

  connectionSuccess: boolean;

  connectionAttempted: boolean;

  // STEP 5

  paymentMethod: BillingPaymentMethod;

  cardHolderName: string;

  cardNumber: string;

  expiry: string;

  cvv: string;

  continueLater: boolean;

  cardcomLowProfileId?: string;

  cardcomInternalDealNumber?: number;
}

export const initialState: OrganizationRegistrationState = {
  entityId: null,

  // STEP 1

  entityType: '',

  organizationName: '',

  organizationNumber: '',

  primaryCategory: '',

  fullName: '',

  phone: '',

  email: '',

  certificateFileName: '',

  certificateFileUrl: '',

  section46FileName: '',

  section46FileUrl: '',

  selectedCategories: [],

  certificateFile: null,

  section46File: null,

  // STEP 2

  displayName: '',

  organizationDescription: '',

  website: '',

  selectedCampaignTypes: ['one-time', 'recurring'],

  logoPreview: '',

  logoFile: null,

  // STEP 3

  monthlyGoal: '',

  yearlyGoal: '',

  // STEP 4

  provider: 'cardcom',

  terminalNumber: '',

  apiUsername: '',

  apiPassword: '',

  useExistingTerminal: false,

  connectionSuccess: false,

  connectionAttempted: false,

  // STEP 5

  paymentMethod: 'credit-card',

  cardHolderName: '',

  cardNumber: '',

  expiry: '',

  cvv: '',

  continueLater: false,

  cardcomLowProfileId: '',

  cardcomInternalDealNumber: 0,
};

// The same "is this registration actually finishable" rule createEntity used
// to apply only at final submit — pulled out so a mid-wizard draft save can
// use it too. Completion does not submit a draft; submission is explicit.
export function isProfileComplete(state: OrganizationRegistrationState): boolean {
  return !!(
    state.entityType?.trim() &&
    state.organizationName?.trim() &&
    state.organizationNumber?.trim() &&
    state.displayName?.trim() &&
    state.email?.trim() &&
    state.phone?.trim() &&
    state.organizationDescription?.trim()
  );
}

// Minimum a draft needs before it can be saved at all — matches step 1's own
// canContinue gate, and not coincidentally: registration_number is UNIQUE at
// the DB level, so saving before it's filled in would let two different
// users' empty drafts collide.
export function canSaveDraft(state: OrganizationRegistrationState): boolean {
  return !!(
    state.entityType &&
    state.organizationName.trim() &&
    state.organizationNumber.trim()
  );
}

// Exported so the AI campaign-creation flow (ai-campaign-creation-page) can
// build a real createEntity payload from Brief-derived data without
// duplicating this field mapping — same reasoning as reusing
// CampaignApiService.toSnake() instead of re-deriving CampaignDraft's field
// names elsewhere.
export function buildPayload(state: OrganizationRegistrationState) {
  return {
    entity_type: state.entityType,
    legal_name: state.organizationName,
    display_name: state.displayName,
    registration_number: state.organizationNumber,
    email: state.email,
    phone: state.phone,
    website: state.website.trim() || null,
    description: state.organizationDescription,
    logo_url: null,
    is_profile_complete: isProfileComplete(state),
    primary_category: state.primaryCategory,
    secondary_categories: state.selectedCategories,
    campaign_types: state.selectedCampaignTypes,
    monthly_goal: state.monthlyGoal,
    yearly_goal: state.yearlyGoal,
    billing_provider: state.provider,
    billing_skip_setup: state.useExistingTerminal,
    cardcom_terminal_number: state.terminalNumber,
    cardcom_api_username: state.apiUsername,
    cardcom_api_password_encrypted: state.apiPassword,
    cardcom_connection_status: state.useExistingTerminal
      ? 'skipped'
      : state.connectionSuccess
        ? 'success'
        : 'not_tested',
    contact_full_name: state.fullName,
    contact_phone: state.phone,
    contact_email: state.email,
    association_certificate_url: state.certificateFileUrl,
    association_certificate_name: state.certificateFileName,
    tax_document_url: state.section46FileUrl,
    tax_document_name: state.section46FileName,
  };
}

@Injectable({
  providedIn: 'root',
})
export class OrganizationRegistrationStateService {
  readonly state = signal<OrganizationRegistrationState>(initialState);
  readonly saving = signal(false);
  readonly identityDuplicate = signal(false);
  private savedBillingReference: string | null = null;

  private entitiesService = inject(EntitiesService);
  private billingService = inject(BillingService);

  updateState(partial: Partial<OrganizationRegistrationState>): void {
    if ((partial.organizationNumber !== undefined && partial.organizationNumber !== this.state().organizationNumber) ||
        (partial.entityType !== undefined && partial.entityType !== this.state().entityType)) this.identityDuplicate.set(false);
    this.state.update((current) => ({
      ...current,

      ...partial,
    }));
  }

  resetState(): void {
    this.identityDuplicate.set(false);
    this.state.set(initialState);
  }

  get isProfileComplete(): boolean {
    return isProfileComplete(this.state());
  }

  get canSaveDraft(): boolean {
    return !this.identityDuplicate() && canSaveDraft(this.state());
  }

  // Single save path shared by the "שמור טיוטה" button (any step) and the
  // final review-step submit — the only difference is includeBilling, since
  // re-running the platform-commission billing creation on every draft save
  // would create a duplicate entity_billing row each time.
  save(options: { includeBilling: boolean }): Observable<any> {
    return this.runExclusive(() => this.persist(options));
  }

  submitForReview(): Observable<any> {
    return this.runExclusive(() => {
      if (!this.isProfileComplete) return throwError(() => new Error('יש להשלים סוג גוף, שם רשמי, מספר רישום, שם לתצוגה, דוא״ל, טלפון ותיאור לפני ההגשה.'));
      return this.persist({includeBilling: true}).pipe(
        switchMap(entity => this.entitiesService.requestReview(entity.id)),
        map(result => result.entity || result),
      );
    });
  }

  private runExclusive(work: () => Observable<any>): Observable<any> {
    return defer(() => {
      if (this.saving()) return throwError(() => new Error('שמירת העמותה כבר מתבצעת. יש להמתין לסיום.'));
      this.saving.set(true);
      return defer(work).pipe(finalize(() => this.saving.set(false)));
    });
  }

  private persist(options: { includeBilling: boolean }): Observable<any> {
    if (this.identityDuplicate()) return throwError(() => new Error('מספר הזיהוי הזה כבר רשום במערכת. לא ניתן ליצור גוף נוסף עם אותו מספר.'));
    const s = this.state();
    const payload = buildPayload(s);

    const create$ = s.entityId
      ? this.entitiesService.updateEntity(s.entityId, payload)
      : this.entitiesService.createEntity(payload).pipe(
          map((res) => res.entity),
        );

    return create$.pipe(
      tap({error: error => {
        if (error?.error?.code === 'DUPLICATE_LEGAL_IDENTIFIER') this.identityDuplicate.set(true);
      }}),
      switchMap((entity) => {
        const id = entity.id ?? s.entityId;
        if (!s.entityId) this.updateState({ entityId: id });

        const uploads: Observable<any>[] = [];

        if (s.certificateFile) {
          uploads.push(this.entitiesService.uploadAssociationDocument(id, s.certificateFile).pipe(tap(() => {
            if (this.state().certificateFile === s.certificateFile) this.updateState({certificateFile: null});
          })));
        }
        if (s.section46File) {
          uploads.push(this.entitiesService.uploadTaxDocument(id, s.section46File).pipe(tap(() => {
            if (this.state().section46File === s.section46File) this.updateState({section46File: null});
          })));
        }
        if (s.logoFile) {
          uploads.push(this.entitiesService.uploadLogo(id, s.logoFile).pipe(tap(() => {
            if (this.state().logoFile === s.logoFile) this.updateState({logoFile: null});
          })));
        }
        const reference = `${id}:${s.cardcomInternalDealNumber}`;
        if (options.includeBilling && s.cardcomInternalDealNumber && this.savedBillingReference !== reference) {
          uploads.push(
            this.billingService.createEntityBilling({
              entityId: id,
              provider: 'cardcom',
              lowProfileId: s.cardcomLowProfileId,
              internalDealNumber: s.cardcomInternalDealNumber,
            }).pipe(tap(() => { this.savedBillingReference = reference; })),
          );
        }

        if (!uploads.length) return of(entity);

        return forkJoin(uploads).pipe(
          map((results: any[]) => ({
            ...entity,
            logo_url: results.find((r) => r?.result?.logo_url)?.result?.logo_url || entity.logo_url,
            association_certificate_url:
              results.find((r) => r?.result?.association_certificate_url)?.result?.association_certificate_url ||
              entity.association_certificate_url,
            tax_document_url:
              results.find((r) => r?.result?.tax_document_url)?.result?.tax_document_url ||
              entity.tax_document_url,
          })),
        );
      }),
    );
  }

  // Reverse of buildPayload — used to prefill the wizard when resuming an
  // existing draft entity. File objects can't be resumed (browsers don't
  // persist those across sessions) — only their already-uploaded URL/name,
  // which is enough for the upload widgets to show "already uploaded".
  loadFromEntity(entity: any): void {
    this.updateState({
      entityId: entity.id,
      entityType: entity.entity_type || '',
      organizationName: entity.legal_name || '',
      organizationNumber: entity.registration_number || '',
      primaryCategory: entity.primary_category || '',
      selectedCategories: entity.secondary_categories || [],
      fullName: entity.contact_full_name || '',
      phone: entity.contact_phone || entity.phone || '',
      email: entity.contact_email || entity.email || '',
      certificateFileName: entity.association_certificate_name || '',
      certificateFileUrl: entity.association_certificate_url || '',
      section46FileName: entity.tax_document_name || '',
      section46FileUrl: entity.tax_document_url || '',
      displayName: entity.display_name || '',
      organizationDescription: entity.description || '',
      website: entity.website || '',
      selectedCampaignTypes: entity.campaign_types?.length ? entity.campaign_types : initialState.selectedCampaignTypes,
      logoPreview: entity.logo_url || '',
      monthlyGoal: entity.monthly_goal != null ? String(entity.monthly_goal) : '',
      yearlyGoal: entity.yearly_goal != null ? String(entity.yearly_goal) : '',
      terminalNumber: entity.cardcom_terminal_number || '',
      apiUsername: entity.cardcom_api_username || '',
      apiPassword: entity.cardcom_api_password_encrypted || '',
      connectionSuccess: entity.cardcom_connection_status === 'success',
      connectionAttempted: entity.cardcom_connection_status && entity.cardcom_connection_status !== 'not_tested',
      useExistingTerminal: entity.cardcom_connection_status === 'skipped',
    });
  }
}
