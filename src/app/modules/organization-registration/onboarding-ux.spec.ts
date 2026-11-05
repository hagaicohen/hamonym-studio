import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { StepReviewComponent } from './components/step-review/step-review.component';
import { StepEntityComponent } from './components/step-entity/step-entity.component';
import { OrganizationRegistrationStateService, initialState } from './services/organization-registration-state.service';
import { CurrentEntityService } from '../../core/services/current-entity.service';
import { OrganizationChecklistComponent } from '../../shared/components/organization-checklist/organization-checklist.component';
import { organizationHealthChecks } from '../../shared/utils/organization-health';

describe('Organization onboarding completion indicators', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: CurrentEntityService, useValue: { currentEntity: signal(null), setRole: () => {} } },
    ] });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('shows the primary category and all additional categories in Hebrew without duplicates', () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    state.updateState({ primaryCategory: 'political-system', selectedCategories: ['politics-government', 'social-change'] });
    const fixture = TestBed.createComponent(StepReviewComponent); fixture.detectChanges();
    expect(fixture.componentInstance.selectedCategories).toEqual(['מערכת פוליטית', 'פוליטיקה וממשל', 'שינוי חברתי']);
    const tags = Array.from(fixture.nativeElement.querySelector('.summary-tags').querySelectorAll('.summary-tag')) as HTMLElement[];
    expect(tags.map(tag => tag.textContent!.trim())).toEqual(['מערכת פוליטית', 'פוליטיקה וממשל', 'שינוי חברתי']);
    state.updateState({ selectedCategories: ['political-system', 'social-change'] });
    expect(fixture.componentInstance.selectedCategories).toEqual(['מערכת פוליטית', 'שינוי חברתי']);
    state.updateState({ primaryCategory: '', selectedCategories: [] });
    expect(fixture.componentInstance.selectedCategories).toEqual([]);
    fixture.destroy();
  });
  it('allows continuing without a certificate and limits Section 46 guidance to eligible entity types', () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    state.updateState({ entityType: 'association', organizationName: 'Org', organizationNumber: '123', primaryCategory: 'education', fullName: 'Owner', email: 'owner@example.test', phone: '050-0000000' });
    const fixture = TestBed.createComponent(StepEntityComponent); fixture.detectChanges();
    expect(fixture.componentInstance.canContinue).toBeTrue();
    expect(fixture.nativeElement.querySelector('.tax-notice')).not.toBeNull();
    state.updateState({ entityType: 'chalatz' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tax-notice')).toBeNull();
    expect(fixture.componentInstance.canContinue).toBeTrue();
    fixture.destroy();
  });
  it('preserves existing admin indicators and excludes optional tax documents for other entity types', () => {
    const checks = organizationHealthChecks({ entity_type: 'association', association_certificate_name: 'registration.pdf', cardcom_connection_status: 'success', contact_full_name: 'Owner' }, 1);
    expect(checks.length).toBe(5);
    expect(checks.filter(check => check.ok).length).toBe(4);
    const nonAssociation = organizationHealthChecks({ entity_type: 'chalatz' }, 0);
    expect(nonAssociation.length).toBe(4);
    expect(nonAssociation.some(check => check.label === 'אישור מס')).toBeFalse();
  });
  it('shows missing logo, card and documents without introducing registration gates', () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    state.updateState({ ...initialState, entityType: 'association', organizationName: 'Org', organizationNumber: '123', displayName: 'Org', fullName: 'Owner', email: 'owner@example.test', phone: '050-0000000', organizationDescription: 'Organization description' });
    const fixture = TestBed.createComponent(StepReviewComponent);
    fixture.detectChanges();
    const checks = fixture.componentInstance.completionChecks;
    expect(checks.find(check => check.label === 'לוגו')?.ok).toBeFalse();
    expect(checks.find(check => check.label === 'כרטיס אשראי לגביית עמלות')?.ok).toBeFalse();
    expect(checks.find(check => check.label === 'מסמכי רישום')?.ok).toBeFalse();
    expect(checks.some(check => check.label === 'קמפיין קיים')).toBeFalse();
    expect(state.isProfileComplete).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('כרטיס נשמר בהצלחה');
    const finish = fixture.nativeElement.querySelector('button.continue-btn') as HTMLButtonElement;
    expect(finish.disabled).toBeFalse();
    fixture.destroy();
  });
  it('uses actual existing connection and card confirmation values for completed rows', () => {
    const state = TestBed.inject(OrganizationRegistrationStateService);
    state.updateState({ entityType: 'association', logoPreview: '/logo.png', certificateFileName: 'registration.pdf', section46FileName: 'tax.pdf', connectionSuccess: true, useExistingTerminal: false, fullName: 'Owner', billingCard: { last4: "1234", expMonth: "12", expYear: "2030" } });
    const fixture = TestBed.createComponent(StepReviewComponent); fixture.detectChanges();
    const checks = fixture.componentInstance.completionChecks;
    for (const label of ['לוגו', 'מסמכי רישום', 'סליקה מחוברת', 'כרטיס אשראי לגביית עמלות']) expect(checks.find(check => check.label === label)?.ok).toBeTrue();
    expect(checks.find(check => check.label === 'אישור מס')?.detail).toContain('העלאה אינה אימות');
    fixture.destroy();
  });
  it('does not claim a MASAV mandate has been completed during registration', () => {
    TestBed.inject(OrganizationRegistrationStateService).updateState({ paymentMethod: 'masav' });
    const fixture = TestBed.createComponent(StepReviewComponent); fixture.detectChanges();
    expect(fixture.componentInstance.completionChecks.find(check => check.label === 'הרשאת מס״ב')?.ok).toBeFalse();
    fixture.destroy();
  });
  it('renders compact accessible status marks and the unchanged admin percentage', () => {
    const fixture = TestBed.createComponent(OrganizationChecklistComponent);
    fixture.componentInstance.checks = [{ label: 'Ready', ok: true }, { label: 'Missing', ok: false }];
    fixture.componentInstance.showScore = true; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('50%');
    const score = fixture.nativeElement.querySelector('.score');
    const caption = score.querySelector('span');
    expect(getComputedStyle(caption).textAlign).toBe('center');
    const circleBox = score.getBoundingClientRect();
    for (const child of [score.querySelector('strong'), caption]) {
      const box = child.getBoundingClientRect();
      expect(Math.abs(box.left + box.width / 2 - circleBox.left - circleBox.width / 2)).toBeLessThanOrEqual(1);
      expect(box.right).toBeLessThanOrEqual(circleBox.right - 6);
    }
    const mark = fixture.nativeElement.querySelector('.checkmark');
    expect(getComputedStyle(mark).width).toBe('16px');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('.sr-only').textContent).toContain('הושלם');
    fixture.destroy();
  });
});
