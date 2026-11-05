import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { OrganizationRegistrationComponent } from './pages/organization-registration/organization-registration.component';
import { OrganizationRegistrationStateService, resumeStep } from './services/organization-registration-state.service';
import { StepEntityComponent } from './components/step-entity/step-entity.component';
import { StepProfileComponent } from './components/step-profile/step-profile.component';
import { StepGoalsComponent } from './components/step-goals/step-goals.component';
import { StepPaymentComponent } from './components/step-payment/step-payment.component';
import { StepBillingMethodComponent } from './components/step-billing-method/step-billing-method.component';
import { StepReviewComponent } from './components/step-review/step-review.component';

const complete = {
  id: 'd1', status: 'draft', updated_at: '2026-11-05T10:00:00Z',
  entity_type: 'association', legal_name: 'עמותה', registration_number: '580000001', primary_category: 'education',
  contact_full_name: 'ישראל ישראלי', contact_phone: '050-1234567', contact_email: 'a@b.co',
  display_name: 'עמותה', description: 'תיאור ארוך מספיק של העמותה', campaign_types: ['one-time'],
  cardcom_connection_status: 'skipped',
};

describe('Registration draft — resume at the saved step', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<OrganizationRegistrationComponent>;
  let query: Record<string, string> = {};

  function open(entity: any) {
    query = { draft: entity.id };
    fixture = TestBed.createComponent(OrganizationRegistrationComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/api/entities/my')).flush({ entities: [entity] });
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/entities/' + entity.id)).flush(entity);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return convertToParamMap(query); } } } }] });
    for (const step of [StepEntityComponent, StepProfileComponent, StepGoalsComponent, StepPaymentComponent, StepBillingMethodComponent, StepReviewComponent]) {
      TestBed.overrideComponent(step as any, { set: { template: '' } });
    }
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { fixture?.destroy(); http.match(() => true); query = {}; });

  it('reopens a complete draft on the step it was saved on', () => {
    expect(open({ ...complete, onboarding_step: 4 }).currentStep).toBe(4);
  });

  it('reopens on the saved step even when earlier steps are incomplete', () => {
    expect(open({ ...complete, description: 'קצר', contact_phone: '', onboarding_step: 5 }).currentStep).toBe(5);
  });

  it('a draft with no remembered step starts at step 1', () => {
    expect(open({ ...complete, onboarding_step: null }).currentStep).toBe(1);
  });

  it('moving to another step without edits can still be saved, and saves that step', () => {
    const page = open({ ...complete, onboarding_step: 1 });
    const row = { id: 'd1' };
    expect(page.canSaveRow(row)).toBeFalse();
    page.nextStep();
    page.nextStep();
    expect(page.canSaveRow(row)).toBeTrue();
    page.saveDraft();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/entities/d1'));
    expect(req.request.body.onboarding_step).toBe(3);
    req.flush({ ...complete, onboarding_step: 3 });
    expect(page.canSaveRow(row)).toBeFalse();
  });

  it('"שמור טיוטה" sends the current step with the draft', () => {
    const page = open({ ...complete, onboarding_step: 3 });
    page.currentStep = 3;
    TestBed.inject(OrganizationRegistrationStateService).updateState({ displayName: 'שם חדש' });
    page.saveDraft();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/entities/d1'));
    expect(req.request.body.onboarding_step).toBe(3);
  });
});

describe('Registration draft — first save (create) carries the step', () => {
  it('a new registration saved on step 3 sends onboarding_step 3 in the create request', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const state = TestBed.inject(OrganizationRegistrationStateService);
    state.loadFromEntity({ ...complete, id: null });
    state.save({ includeBilling: false, onboardingStep: 3 }).subscribe();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/entities'));
    expect(req.request.body.onboarding_step).toBe(3);
  });
});

describe('resumeStep', () => {
  it('returns a saved step 1-6 as is', () => {
    for (const step of [1, 2, 3, 4, 5, 6]) expect(resumeStep(step)).toBe(step);
    expect(resumeStep('4')).toBe(4);
  });

  it('defaults missing or invalid values to step 1', () => {
    for (const value of [undefined, null, '', 'x', 0, -1, 7, 99, 2.5]) expect(resumeStep(value)).withContext(String(value)).toBe(1);
  });
});
