import { Injectable, signal } from '@angular/core';

export type BillingPaymentMethod = 'credit-card' | 'masav';

export interface OrganizationRegistrationState {
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

  // STEP 2

  displayName: string;

  organizationDescription: string;

  selectedCampaignTypes: string[];

  logoPreview: string;

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

  masavUploaded: boolean;

  masavFileName: string;

  continueLater: boolean;
}

const initialState: OrganizationRegistrationState = {
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

  // STEP 2

  displayName: '',

  organizationDescription: '',

  selectedCampaignTypes: ['one-time', 'recurring'],

  logoPreview: '',

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

  masavUploaded: false,

  masavFileName: '',

  continueLater: false,
};

@Injectable({
  providedIn: 'root',
})
export class OrganizationRegistrationStateService {
  readonly state = signal<OrganizationRegistrationState>(initialState);

  updateState(partial: Partial<OrganizationRegistrationState>): void {
    this.state.update((current) => ({
      ...current,

      ...partial,
    }));
  }

  resetState(): void {
    this.state.set(initialState);
  }
}
