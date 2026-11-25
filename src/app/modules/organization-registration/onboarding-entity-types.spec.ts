import { signal } from '@angular/core';
import { StepProfileComponent } from './components/step-profile/step-profile.component';
import { TestBed } from '@angular/core/testing';
import { OrganizationRegistrationStateService } from './services/organization-registration-state.service';
import { BillingService } from './services/billing.service';
import { organizationMissingItems } from '../../shared/utils/organization-readiness';
import { StepBillingMethodComponent } from './components/step-billing-method/step-billing-method.component';
import { ENTITY_CONFIGS } from './config/entity-config';
import { buildPayload, initialState, stepGatePasses } from './services/organization-registration-state.service';

describe('Existing entity onboarding compatibility', () => {
  it('renders both optional activity choices for a business', () => {
    const state = signal({...initialState, entityType:'sole_exempt'});
    TestBed.configureTestingModule({providers:[{provide:OrganizationRegistrationStateService,useValue:{state,updateState:()=>{}}}]});
    const fixture=TestBed.createComponent(StepProfileComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.campaign-type-row').length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('חובה לבחור לפחות סוג קמפיין אחד');
    fixture.destroy();
  });
  it('distinguishes commercial billing copy without changing nonprofit terms', () => {
    const state=signal({...initialState,entityType:'sole_exempt'});
    TestBed.configureTestingModule({providers:[{provide:OrganizationRegistrationStateService,useValue:{state}},{provide:BillingService,useValue:{}}]});
    const component=TestBed.runInInjectionContext(()=>new StepBillingMethodComponent());
    expect(component.isCommercialEntity).toBeTrue();
    state.set({...state(),entityType:'association'});
    expect(component.isCommercialEntity).toBeFalse();
  });
  it('does not add tax approval or campaign purpose to commercial readiness', () => {
    const items=organizationMissingItems({entity_type:'sole_exempt'});
    expect(items.some(item=>item.key==='tax_document')).toBeFalse();
    expect(items.some(item=>item.key==='campaign_types')).toBeFalse();
    expect(items.find(item=>item.key==='cardcom')?.detail).not.toContain('תרומות');
  });
  for (const entityType of ['association', 'chalatz', 'sole_exempt', 'sole_registered', 'company'] as const) {
    it(`${entityType}: campaign purpose and documents are not profile gates`, () => {
      const state = {...initialState, entityType, displayName: 'Test entity',
        organizationDescription: 'An existing valid description', selectedCampaignTypes: []};
      const service = {state: signal(state), updateState: jasmine.createSpy()};
      const component = new StepProfileComponent(service as any);
      expect(component.canContinue).toBeTrue();
      expect(stepGatePasses(2, state)).toBeTrue();
      expect(buildPayload(state).campaign_types).toEqual([]);
      service.state.set({...state, displayName: ''});
      expect(component.canContinue).toBeFalse();
      expect(stepGatePasses(2, service.state())).toBeFalse();
    });
  }
  it('retains existing purpose selections and nonprofit document configuration', () => {
    const state = {...initialState, selectedCampaignTypes: ['donation']};
    expect(buildPayload(state).campaign_types).toEqual(['donation']);
    expect(ENTITY_CONFIGS.association.showSection46).toBeTrue();
    expect(ENTITY_CONFIGS.sole_exempt.showSection46).toBeFalse();
    expect(ENTITY_CONFIGS.sole_registered.showSection46).toBeFalse();
    expect(ENTITY_CONFIGS.company.showSection46).toBeFalse();
  });
});


