import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PlatformOrganizationsPageComponent } from './platform-organizations-page.component';
import { PlatformService } from '../../services/platform.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';

describe('Organizations — isolated UI and navigation', () => {
  const organization = {
    id: 'org-1', display_name: 'עמותה לדוגמה', legal_name: 'עמותה רשמית', registration_number: '580123456',
    status: 'active', owner_name: 'מנהל לדוגמה', profile_completion: 80,
    missing_profile_fields: ['אישור סעיף 46'], campaigns_count: 3, active_campaigns_count: 1,
    total_raised: 143.37, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-22T21:30:00Z',
  };
  async function setup(response: any = { organizations: [organization], total: 1, unfilteredTotal: 1 }, fail = false) {
    localStorage.removeItem('platformColumns_organizations');
    const api = { getOrganizations: jasmine.createSpy().and.returnValue(fail ? throwError(() => ({ status: 500 })) : of(response)) };
    await TestBed.configureTestingModule({ imports: [PlatformOrganizationsPageComponent], providers: [
      provideRouter([]), { provide: PlatformService, useValue: api },
      { provide: CurrentContextService, useValue: { isSuperAdmin: () => true } },
    ] }).compileComponents();
    Object.defineProperty(TestBed.inject(ActivatedRoute).snapshot, 'queryParamMap', { value: convertToParamMap({ status: 'active' }) });
    const fixture = TestBed.createComponent(PlatformOrganizationsPageComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, api };
  }
  it('renders actual missing fields, active/total counts, Israel dates and native organization links', async () => {
    const { element } = await setup();
    expect(element.querySelector('.org-link')!.getAttribute('href')).toContain('/platform/organizations/org-1');
    expect(element.textContent).toContain('אישור סעיף 46'); expect(element.textContent).toContain('143.37');
    expect(element.textContent).toContain('23/10/2026');
    expect(element.querySelector('.plat-progress-track')).toBeNull();
    expect(element.querySelectorAll('tbody .numeric')[0].textContent).toContain('פעילים: 1 מתוך 3 בסך הכול');
    expect(element.querySelector('.missing-count')!.textContent).toContain('1 להשלמה');
    expect(element.querySelectorAll('tbody time').length).toBe(1);
  });
  it('additional filters retain the selected status and use read-only service calls', async () => {
    const { fixture, element, api } = await setup();
    const filters = element.querySelector('details') as HTMLDetailsElement;
    expect(filters.open).toBeFalse();
    (filters.querySelector('summary') as HTMLElement).click();
    expect(filters.open).toBeTrue();
    (element.querySelector('.plat-chip') as HTMLButtonElement).click(); fixture.detectChanges();
    const query = api.getOrganizations.calls.mostRecent().args[0];
    expect(query.status).toBe('active'); expect(query.missingDocs).toBeTrue();
  });
  it('does not invent active campaigns or claim unsupported search/matching on an older Backend', async () => {
    const { element } = await setup({ organizations: [{ ...organization, active_campaigns_count: undefined, missing_profile_fields: undefined }], total: 1 });
    expect((element.querySelector('input[type="search"]') as HTMLInputElement).placeholder).toBe('חיפוש לפי שם עמותה');
    expect(element.querySelectorAll('tbody .numeric')[0].textContent).toContain('פעילים: — מתוך 3 בסך הכול');
    expect(element.textContent).toContain('לבדיקת פרטים חסרים');
  });
  it('distinguishes an empty system from a filtered list with no results', async () => {
    const { element } = await setup({ organizations: [], total: 0, unfilteredTotal: 0 });
    expect(element.textContent).toContain('עדיין אין עמותות במערכת');
    expect(element.textContent).not.toContain('לא נמצאו עמותות התואמות לסינון');
  });
  it('keeps errors distinct from empty states and provides retry', async () => {
    const { element } = await setup(undefined, true);
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.querySelector('.plat-empty')).toBeNull();
    expect(element.textContent).toContain('נסה שוב');
  });
  it('uses compact RTL rows and confines horizontal overflow to the table', async () => {
    const { element } = await setup(); const main = element.querySelector('main')!;
    expect(getComputedStyle(main).direction).toBe('rtl');
    expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth + 1);
    expect(element.querySelector('tbody tr')!.getBoundingClientRect().height).toBeLessThanOrEqual(60);
    expect(getComputedStyle(element.querySelector('.plat-table-wrap')!).overflowX).toBe('auto');
  });
});
