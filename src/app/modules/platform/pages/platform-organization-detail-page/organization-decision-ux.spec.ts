import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject } from 'rxjs';
import { PlatformOrganizationDetailPageComponent } from './platform-organization-detail-page.component';
import { PlatformService } from '../../services/platform.service';
import { BillingOpsService } from '../../services/billing-ops.service';

describe('Organization decision UX', () => {
  let api: any;
  let billingOps: any;
  let masavConfig: any;
  let harness: RouterTestingHarness;
  let page: PlatformOrganizationDetailPageComponent;
  let entity: any;
  const result = (org: any) => ({ entity: org, users: [], campaigns: [], ambassadors: [], donations: [], donationsKpi: null, auditLog: [], donorCount: 0 });
  beforeEach(async () => {
    spyOn(localStorage, 'getItem').and.returnValue(null);
    entity = { id: 'entity-a', display_name: 'Test organization', status: 'pending_review' };
    masavConfig = null;
    billingOps = { getMasavConfig: jasmine.createSpy('getMasavConfig').and.callFake(() => of({ config: masavConfig })) };
    api = { getOrganization: jasmine.createSpy('getOrganization').and.callFake(() => of(result(entity))) };
    for (const key of ['approve', 'requestChanges', 'reject', 'suspend', 'reactivate']) api[key] = jasmine.createSpy(key).and.returnValue(of({}));
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'platform/organizations/:id', component: PlatformOrganizationDetailPageComponent }]),
      { provide: PlatformService, useValue: api },
      { provide: BillingOpsService, useValue: billingOps },
    ] });
    harness = await RouterTestingHarness.create('/platform/organizations/entity-a');
    page = harness.routeDebugElement!.componentInstance;
    page.context.setSuperAdmin(true);
  });
  const text = (el: HTMLElement) => el.textContent || '';
  function el(selector: string): HTMLElement { return harness.fixture.nativeElement.querySelector(selector); }
  function render() { harness.fixture.detectChanges(); }
  it('shows decisions next to completion with explanations and no immediate mutation', () => {
    const choices = [...harness.fixture.nativeElement.querySelectorAll('.management-choice')] as HTMLElement[];
    expect(choices.length).toBe(3);
    expect(text(choices[0])).toContain('אישור עמותה');
    expect(text(choices[1])).toContain('החזרה להשלמת פרטים');
    expect(text(choices[2])).toContain('אין מחיקה');
    expect(el('.management-panel').compareDocumentPosition(el('.plat-timeline')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const key of ['approve', 'requestChanges', 'reject']) expect(api[key]).not.toHaveBeenCalled();
  });
  it('asks for a single explicit approval without decision reasons', () => {
    el('.management-choice.primary').click(); render();
    expect(text(el('.approve-summary'))).toContain('Test organization');
    expect(el('.management-reasons')).toBeNull();
    expect(text(el('.approve-note'))).toContain('הערה לאישור (לא חובה)');
    expect(text(el('.management-confirm'))).toBe('אשר עמותה');
    expect((el('.management-confirm') as HTMLButtonElement).disabled).toBeFalse();
    expect(api.approve).not.toHaveBeenCalled();
    el('.management-confirm').click(); render();
    expect(api.approve).toHaveBeenCalledOnceWith('entity-a', undefined, []);
    expect(el('[role="dialog"]')).toBeNull();
    expect(text(el('[role="status"]'))).toContain('אושרה בהצלחה');
  });
  it('lists only the organization\'s actual missing items, grouped by importance', () => {
    page.entity = { ...entity, entity_type: 'association', association_certificate_name: 'cert.pdf', tax_document_name: null,
      cardcom_connection_status: 'failed', billing_method: 'masav', billing_masav_file_name: null, logo_url: null, contact_full_name: 'Dana' };
    page.openManagementAction('approve'); render();
    const rows = [...harness.fixture.nativeElement.querySelectorAll('.approve-missing-item')] as HTMLElement[];
    expect(rows.map(r => r.getAttribute('data-severity'))).toEqual(['legal', 'operational', 'operational', 'recommendation']);
    expect(rows.map(r => text(r.querySelector('strong')!))).toEqual(['אישור מס (סעיף 46)', 'חיבור CardCom', 'הרשאה לחיוב מס״ב', 'לוגו']);
    expect(el('.approve-missing-none')).toBeNull();
  });
  it('MASAV readiness reads the real authorization record: missing, uploaded pending review, approved', () => {
    const masavEntity = { ...entity, entity_type: 'company', association_certificate_name: 'cert.pdf', cardcom_connection_status: 'success',
      billing_method: 'masav', billing_masav_file_name: null, logo_url: 'logo.png', contact_full_name: 'Dana' };
    const masavRow = () => harness.fixture.nativeElement.querySelector('.approve-missing-item') as HTMLElement | null;
    const open = (config: any) => {
      masavConfig = config; entity = masavEntity; page.load(); render();
      page.openManagementAction('approve'); render();
    };
    open(null);
    expect(billingOps.getMasavConfig).toHaveBeenCalledWith('entity-a');
    expect(text(masavRow()!)).toContain('טופס ההרשאה לא הועלה');
    page.closeManagementAction(); render();
    open({ has_authorization_document: true, authorized: false });
    expect(text(masavRow()!)).toContain('ממתין לבדיקה ולאישור');
    expect(masavRow()!.getAttribute('data-severity')).toBe('operational');
    page.closeManagementAction(); render();
    open({ has_authorization_document: true, authorized: true });
    expect(masavRow()).toBeNull();
  });
  it('shows a quiet success state when readiness checks find nothing missing', () => {
    page.entity = { ...entity, entity_type: 'company', association_certificate_name: 'cert.pdf', cardcom_connection_status: 'success',
      billing_method: 'credit-card', logo_url: 'logo.png', contact_full_name: 'Dana' };
    page.openManagementAction('approve'); render();
    expect(el('.approve-missing-item')).toBeNull();
    expect(text(el('.approve-missing-none'))).toContain('לא נמצאו פרטים חסרים בבדיקות המוכנות.');
  });
  it('explains rejection, retains mandatory notes and compact optional reasons, and prevents duplicate requests', () => {
    const response = new Subject<any>(); api.reject.and.returnValue(response);
    page.openManagementAction('reject'); render();
    expect(text(el('.management-explanation'))).toContain('לא יימחקו');
    expect(text(el('.management-explanation'))).toContain('פעולת המחיקה הנפרדת');
    expect(text(el('.management-confirm'))).toBe('דחה את הבקשה');
    expect((el('.management-confirm') as HTMLButtonElement).disabled).toBeTrue();
    page.confirmManagementAction(); expect(api.reject).not.toHaveBeenCalled();
    page.notes = '  Missing document  '; page.toggleReasonTag('missing_docs'); render();
    const checkbox = el('.management-reasons input') as HTMLInputElement;
    expect(getComputedStyle(checkbox).width).toBe('16px');
    expect(getComputedStyle(checkbox).height).toBe('16px');
    expect(checkbox.checked).toBeTrue();
    el('.management-confirm').click(); render();
    page.confirmManagementAction(); page.closeManagementAction();
    expect(api.reject).toHaveBeenCalledTimes(1);
    expect(api.reject).toHaveBeenCalledWith('entity-a', 'Missing document', ['missing_docs']);
    expect(page.pendingManagementAction).toBe('reject');
    expect((el('.management-confirm') as HTMLButtonElement).disabled).toBeTrue();
    expect(checkbox.disabled).toBeTrue();
    entity = { ...entity, status: 'rejected' }; response.next({}); response.complete(); render();
    expect(page.entity.status).toBe('rejected');
    expect(el('[role="dialog"]')).toBeNull();
    expect(text(el('[role="status"]'))).toContain('נשמרו');
  });
  it('keeps API failures in the confirmation with entered notes and allows a normal retry', () => {
    const response = new Subject<any>(); api.requestChanges.and.returnValue(response);
    page.openManagementAction('requestChanges'); page.notes = 'Please clarify'; render();
    el('.management-confirm').click(); render();
    response.error({ error: { error: 'שגיאה בשמירת ההחלטה' } }); render();
    expect(el('[role="dialog"]')).not.toBeNull();
    expect(text(el('.management-form [role="alert"]'))).toContain('שגיאה בשמירת ההחלטה');
    expect(page.notes).toBe('Please clarify');
    expect((el('.management-confirm') as HTMLButtonElement).disabled).toBeFalse();
    api.requestChanges.and.returnValue(of({})); el('.management-confirm').click(); render();
    expect(api.requestChanges).toHaveBeenCalledTimes(2);
    expect(el('[role="dialog"]')).toBeNull();
  });
  it('cancels without sending a decision and restores keyboard focus', () => {
    const trigger = el('.management-choice.primary'); trigger.focus(); trigger.click(); render();
    el('[aria-label="סגירת פרטים"]').click(); render();
    expect(el('[role="dialog"]')).toBeNull();
    expect(api.approve).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });
  it('preserves status-based actions and blocks stale action selection during refresh', () => {
    for (const [status, keys] of [
      ['active', ['suspend']], ['suspended', ['reactivate']], ['rejected', ['requestChanges']], ['draft', ['requestChanges']], ['changes_requested', ['requestChanges']],
    ] as const) {
      page.entity = { ...entity, status };
      expect(page.managementActions.map(action => action.key)).toEqual([...keys]);
    }
    page.entity = { ...entity, status: 'pending_review' }; page.refreshing = true;
    page.openManagementAction('approve');
    expect(page.pendingManagementAction).toBeNull();
    render(); expect((el('.management-choice') as HTMLButtonElement).disabled).toBeTrue();
    expect(TestBed.inject(Router).url).toBe('/platform/organizations/entity-a');
  });
});
