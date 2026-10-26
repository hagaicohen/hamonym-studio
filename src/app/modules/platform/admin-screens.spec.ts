import { environment } from '../../../environments/environment';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of, throwError, Subject } from 'rxjs';
import { PlatformPartnersPageComponent } from './pages/platform-partners-page/platform-partners-page.component';
import { PlatformCampaignsPageComponent } from './pages/platform-campaigns-page/platform-campaigns-page.component';
import { PlatformUsersPageComponent } from './pages/platform-users-page/platform-users-page.component';
import { PlatformCardcomOpsPageComponent } from './pages/platform-cardcom-ops-page/platform-cardcom-ops-page.component';
import { PlatformCollectionOpsPageComponent } from './pages/platform-collection-ops-page/platform-collection-ops-page.component';
import { PlatformGeneralSettingsPageComponent } from './pages/platform-general-settings-page/platform-general-settings-page.component';
import { PlatformOrganizationDetailPageComponent } from './pages/platform-organization-detail-page/platform-organization-detail-page.component';
import { AdminDetailsDrawerComponent } from './components/admin-details-drawer/admin-details-drawer.component';
import { PlatformService } from './services/platform.service';
import { CardcomOpsService } from './services/cardcom-ops.service';
import { CollectionOpsService } from './services/collection-ops.service';
import { BillingOpsService } from './services/billing-ops.service';
import { FinanceOpsService } from './services/finance-ops.service';
import { BillingProvisioningService } from './services/billing-provisioning.service';
import { BillingSettingsService } from './services/billing-settings.service';
import { CampaignResetService } from './services/campaign-reset.service';
import { SimulationClockService } from './services/simulation-clock.service';
import { CurrentContextService } from '../../core/services/current-context.service';
import { EntitiesService } from '../../core/services/entities.service';
import { CurrentEntityService } from '../../core/services/current-entity.service';
import { AmbassadorService } from '../campaigns/services/ambassador.service';

@Component({ standalone: true, imports: [AdminDetailsDrawerComponent], template: `<button id="drawer-trigger" (click)="open = true">פרטים</button>@if (open) { <app-admin-details-drawer heading="בדיקה" (closed)="open = false"><a href="#details">קישור בפירוט</a><button id="drawer-last">פעולה אחרונה</button></app-admin-details-drawer> }` })
class DrawerHost { open = false; }

describe('Admin screens – isolated render and interactions', () => {
  const partner = { id: 'p', display_name: 'שותף לדוגמה', legal_name: null, logo_url: null, website: null, is_hidden: true, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-22T21:30:00Z', owner_name: 'מנהל לדוגמה', owner_email: 'mock@example.test', campaigns_count: 2, campaign_slug: 'test' };
  const campaign = { id: 'c', title: 'קמפיין לדוגמה', slug: 'test', status: 'draft', current_amount: 4050.37, target_amount: 5000, supporters_count: 5, is_featured: false, is_locked: false, deleted_at: null, created_at: '2026-10-01T12:00:00Z', entity_id: 'e', entity_name: 'עמותה לדוגמה' };
  const user = { id: 'u', full_name: 'משתמש לדוגמה', email: 'mock@example.test', role_name: 'תורם', role_id: 2, is_active: true, is_super_admin: true, email_verified: true, last_login_at: null, created_at: '2026-10-01T12:00:00Z', entities_count: 1, platform_permissions: null, deleted_at: null };
  const donation = { id: 'd', donor_name: 'תורם לדוגמה', amount: 143.37, status: 'paid', is_anonymous: false, is_recurring: false, failure_reason: null, created_at: '2026-10-22T21:30:00Z', completed_at: '2026-10-22T21:31:00Z', campaign_id: 'c', campaign_title: campaign.title, campaign_slug: 'test', entity_id: 'e', entity_name: 'עמותה לדוגמה' };
  let platform: any, financialWrites: jasmine.Spy;
  async function setup<T>(component: any): Promise<any> {
    TestBed.resetTestingModule();
    localStorage.removeItem('platformColumns_partners'); localStorage.removeItem('platformColumns_campaigns'); localStorage.removeItem('platformColumns_users'); localStorage.removeItem('platformColumns_donations');
    financialWrites = jasmine.createSpy('forbidden financial write').and.callFake(() => { throw new Error('No financial operations in UI tests'); });
    platform = {
      getPartners: jasmine.createSpy().and.returnValue(of({ partners: [partner], total: 1 })),
      getCampaigns: jasmine.createSpy().and.returnValue(of({ campaigns: [campaign], total: 1 })),
      getCampaign: jasmine.createSpy().and.returnValue(of({ campaign: { ...campaign, end_date: '2026-11-01T12:00:00Z' } })),
      getUsers: jasmine.createSpy().and.returnValue(of({ users: [user], total: 1 })),
      getUser: jasmine.createSpy().and.returnValue(of({ user, entities: [{ entity_id: 'e', entity_name: 'עמותה לדוגמה', role: 'owner' }], auditLog: [] })),
      getRoles: () => of({ roles: [{ id: 2, name: 'תורם' }] }),
      getOrganizationFilterOptions: () => of([{ id: 'e', name: 'עמותה לדוגמה' }]),
      getCampaignFilterOptions: () => of([{ id: 'c', name: campaign.title }]),
      getOrganization: () => of({ entity: { id: 'e', status: 'active', display_name: 'עמותה לדוגמה', created_at: '2026-10-01T12:00:00Z', flagged_for_review: false }, users: [], campaigns: [campaign], ambassadors: [], donations: [], auditLog: [{ id: 'a', action: 'approve', notes: '{"internal_id":"hidden-in-main-view"}', created_at: '2026-10-02T12:00:00Z', super_admin_name: 'מנהל' }] }),
      setCampaignStatus: financialWrites, duplicateCampaign: financialWrites, approve: financialWrites, suspend: financialWrites,
    };
    await TestBed.configureTestingModule({
      imports: [component],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}), paramMap: convertToParamMap({ id: 'e' }), fragment: null } } },
        { provide: PlatformService, useValue: platform },
        { provide: CurrentContextService, useValue: { isSuperAdmin: () => true, hasPlatformSection: () => true } },
        { provide: CardcomOpsService, useValue: { listDonations: () => of({ donations: [donation], total: 1, page: 0, limit: 25 }), getHealth: () => of({ jobs: [], alerts: [], webhooks: [], knownJobs: [], schedulerHeartbeat: { healthy: true } }), getFindings: () => of({ findings: [] }) } },
        { provide: FinanceOpsService, useValue: { listExceptions: () => of({ exceptions: [] }), getExceptionActions: () => of({ actions: [] }), resolveException: financialWrites } },
        { provide: CollectionOpsService, useValue: { getOverview: () => throwError(() => new Error('Mock unavailable overview')), getNeedsAttention: () => of({ totalCount: 0, categories: [] }), getSystemActivity: () => of({ automatic: [], manual: [] }), searchHistory: () => of({ statements: [] }), getReportPreview: () => of({ rows: [] }) } },
        { provide: BillingOpsService, useValue: { listPeriods: () => of({ periods: [] }), listStatements: () => of({ statements: [] }), triggerCollection: financialWrites } },
        { provide: BillingProvisioningService, useValue: { getReadiness: () => of({ entities: [] }) } },
        { provide: SimulationClockService, useValue: { getStatus: () => of({ overrideActive: false, businessNow: '2026-10-23T12:00:00Z', realNow: '2026-10-23T12:00:00Z', simulationEnabled: true, collectionAuthorized: false }), setFixed: financialWrites, reset: financialWrites } },
        { provide: BillingSettingsService, useValue: { get: () => of({ setting: { vat_rate: '0.18' } }), update: financialWrites } },
        { provide: CampaignResetService, useValue: { getStatus: () => of({ status: { available: true, campaignId: 'c', campaignTitle: campaign.title, counts: { donations: 2 }, totalRecords: 2, snapshotHash: 'mock', recordIds: { donations: ['d1', 'd2'] }, message: 'זמין לבדיקת ממשק' } }), getPreview: () => of({ preview: { totalAmount: 143.37, donationCount: 2, paidDonationCount: 1 } }), reset: financialWrites } },
        { provide: EntitiesService, useValue: {} }, { provide: CurrentEntityService, useValue: {} }, { provide: AmbassadorService, useValue: {} },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(component); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); return fixture;
  }
  afterEach(() => { expect(financialWrites).not.toHaveBeenCalled(); TestBed.resetTestingModule(); });
  it('Partners: linked details, visibility, filtered empty state and read retry', async () => {
    const fixture = await setup(PlatformPartnersPageComponent); const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('מוסתר מגילוי ציבורי');
    (element.querySelector('.name-cell button') as HTMLButtonElement).click(); fixture.detectChanges(); expect(element.querySelector('[role="dialog"]')).toBeTruthy();
    fixture.componentInstance.selectedPartner = null; platform.getPartners.and.returnValue(throwError(() => new Error('offline'))); fixture.componentInstance.load(); fixture.detectChanges(); expect(element.querySelector('[role="alert"]')).toBeTruthy();
    platform.getPartners.and.returnValue(of({ partners: [], total: 0 })); fixture.componentInstance.searchQuery = 'אין'; fixture.componentInstance.load(); fixture.detectChanges(); expect(element.textContent).toContain('אין שותפים התואמים לסינון');
  });
  it('Campaigns: labeled links, 81 percent progress and confirmation before a status mutation', async () => {
    const fixture = await setup(PlatformCampaignsPageComponent); const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('81%'); expect(element.textContent).toContain('4,050.37'); expect(element.querySelector('a[href="/platform/organizations/e"]')).toBeTruthy();
    fixture.componentInstance.openCampaign(campaign); fixture.detectChanges(); expect(element.querySelector('[role="dialog"]')).toBeTruthy();
    fixture.componentInstance.closeCampaign(); fixture.componentInstance.onStatusChange(campaign, 'published'); fixture.detectChanges(); expect(element.querySelector('.plat-modal')).toBeTruthy(); expect(platform.setCampaignStatus).not.toHaveBeenCalled();
  });
  it('Campaign actions use an accessible ellipsis and omit the current status from available actions', async () => {
    const fixture = await setup(PlatformCampaignsPageComponent);
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector('.campaign-more-button') as HTMLButtonElement;
    expect(trigger.textContent?.trim()).toBe('⋯');
    expect(trigger.getAttribute('aria-label')).toContain(campaign.title);
    trigger.click(); fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeTruthy();
    expect(fixture.componentInstance.availableStatuses({ ...campaign, status: 'published' })).not.toContain('published');
    expect(element.querySelector('select option:disabled')?.textContent).toContain('מצב נוכחי');
    fixture.componentInstance.selectedCampaign = { ...campaign, deleted_at: '2026-10-24T12:00:00Z' };
    fixture.detectChanges();
    expect(element.querySelector('.campaign-actions-menu')?.textContent).toContain('שחזור קמפיין');
    expect(element.querySelector('.campaign-actions-menu select')).toBeNull();
    spyOn(fixture.componentInstance.context, 'hasPlatformSection').and.returnValue(false);
    fixture.detectChanges();
    expect(element.querySelector('.campaign-actions-menu button')).toBeNull();
    fixture.componentInstance.selectedCampaign = { ...campaign }; fixture.detectChanges();
    expect(element.querySelectorAll('.campaign-actions-menu button.secondary-button').length).toBe(1);
    expect(element.querySelector('.campaign-actions-menu button.secondary-button')?.textContent).toContain('העתקת קישור');
    expect(element.querySelector('.campaign-actions-menu select')).toBeNull();
    expect(fixture.componentInstance.availableStatuses(campaign)).toEqual([]);
  });
  it('Users: combined identity, permission distinct from status and real affiliation links', async () => {
    const fixture = await setup(PlatformUsersPageComponent); const element = fixture.nativeElement as HTMLElement;
    const identity = element.querySelector('tbody td')!; expect(identity.textContent).toContain(user.email); expect(identity.textContent).toContain(user.full_name);
    expect(element.querySelector('td[data-label="סטטוס"]')!.textContent).toContain('פעיל'); expect(element.textContent).toContain('טרם התחבר');
    fixture.componentInstance.openUser(user); fixture.detectChanges(); expect(element.querySelector('[role="dialog"] a[href="/platform/organizations/e"]')).toBeTruthy();
  });
  it('Donations: paid-only summary, entity links and receipt drawer use GET only', async () => {
    const fixture = await setup(PlatformCardcomOpsPageComponent); const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.donation-summary')!.textContent).toContain('143.37'); expect(element.querySelector('a[href="/platform/organizations/e"]')).toBeTruthy();
    fixture.componentInstance.openDonation(donation); TestBed.inject(HttpTestingController).expectOne(environment.apiUrl + '/api/donations/public/d').flush({ receipt_id: 'r' }); fixture.detectChanges();
    expect(element.querySelector('[role="dialog"] a[href="/receipts/r"]')).toBeTruthy(); expect(element.textContent).toContain('לא זמין בנתוני התרומה');
  });
  it('Donation diagnostics show verified codes and keep historical unknown failures and raw data private', async () => {
    const fixture = await setup(PlatformCardcomOpsPageComponent);
    const component = fixture.componentInstance;
    component.openDonation({ ...donation, status: 'failed', failure_reason: 'secret-token-605' });
    TestBed.inject(HttpTestingController).expectOne(environment.apiUrl + '/api/platform/cardcom-ops/donations/d').flush({ status: 'failed', failure_diagnostic: { stage: 'cardcom_initialization', providerCode: 605, reason: 'api_user_blocked', failedAt: '2026-10-24T19:34:00.000Z' } });
    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('חסום (605)');
    expect(dialog.textContent).toContain('אתחול התשלום');
    expect(dialog.textContent).not.toContain('secret-token');
    component.openDonation({ ...donation, status: 'failed', failure_reason: '605' });
    TestBed.inject(HttpTestingController).expectOne(environment.apiUrl + '/api/platform/cardcom-ops/donations/d').flush({ status: 'failed', failure_diagnostic: null });
    fixture.detectChanges();
    expect(dialog.textContent).toContain('סיבת הכישלון אינה ידועה');
    expect(dialog.textContent).not.toContain('חסום');
  });
  it('Exceptions: open/history tabs, compact zero state and no resolution mutation', async () => {
    const fixture = await setup(PlatformCardcomOpsPageComponent); fixture.componentInstance.toggleAnomalies(); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement; expect(element.querySelector('#anomalies')).toBeTruthy(); expect(element.textContent).toContain('אין ממצאים פתוחים במקורות שנטענו'); expect(element.textContent).toContain('טופלו והיסטוריות');
  });
  it('Collection: history and report states are distinct and read failures are actionable', async () => {
    const fixture = await setup(PlatformCollectionOpsPageComponent); const element = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.setTab('history'); fixture.detectChanges(); expect(element.textContent).toContain('אין תוצאות לסינון הנוכחי');
    fixture.componentInstance.reportPeriodMode = 'all'; fixture.componentInstance.setTab('reports'); fixture.detectChanges(); expect(element.textContent).toContain('הפקת דוח גבייה'); expect(element.querySelector('.col-report-preview')!.hasAttribute('open')).toBeFalse();
  });
  it('Simulation reports mocked monthly lifecycle results and authorization skips in Hebrew', async () => {
    const fixture = await setup(PlatformGeneralSettingsPageComponent);
    const component = fixture.componentInstance;
    const clock = TestBed.inject(SimulationClockService);
    clock.setFixed = jasmine.createSpy().and.returnValue(of({ simulationEnabled: true, overrideActive: true, businessNow: '2026-10-28T18:08:00Z', realNow: '2026-10-25T00:00:00Z', collectionAuthorized: true, results: [
      { step: 'monthly_billing', status: 'success', result: { statementsCreated: 1, approved: 1 } },
      { step: 'fin11-card-collection', status: 'success', result: { succeeded: 0, skippedReasons: { no_active_payment_instrument: 1 } } },
    ] }));
    component.fixedDateInput = '2026-10-28'; component.fixedTimeInput = '20:08'; component.setClockFixed();
    expect(clock.setFixed).toHaveBeenCalledWith('2026-10-28T18:08:00.000Z');
    expect(component.clockActionMessage).toContain('נוצרו 1 חיובים ואושרו 1');
    expect(component.clockActionMessage).toContain('לא מוגדר אמצעי תשלום פעיל');
    clock.setFixed = jasmine.createSpy().and.returnValue(of({ simulationEnabled: true, overrideActive: true, businessNow: '2026-10-28T18:08:00Z', realNow: '2026-10-25T00:00:00Z', results: [{ step: 'fin11-card-collection', status: 'success', result: { errors: 1 } }] }));
    component.setClockFixed(); expect(component.clockActionMessage).toContain('1 שגיאות');
  });
  it('Simulation: two panels, Israel date, scoped reset preview and explicit confirmation', async () => {
    const fixture = await setup(PlatformGeneralSettingsPageComponent); fixture.componentInstance.tab = 'simulation'; fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement; expect(element.querySelectorAll('.simulation-layout > .plat-card').length).toBe(2); expect(element.textContent).toContain('23/10/2026');
    fixture.componentInstance.selectCampaign('c'); fixture.detectChanges(); expect(element.textContent).toContain('143.37'); fixture.componentInstance.resetConfirmOpen = true; fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeTruthy(); expect(element.querySelector('[role="dialog"] button.sim-danger-btn')!.hasAttribute('disabled')).toBeTrue();
  });
  it('Organization detail: no approve for active unflagged organization; technical audit stays collapsed', async () => {
    const fixture = await setup(PlatformOrganizationDetailPageComponent); const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.current-actions')!.textContent).not.toContain('אישור עמותה'); expect(element.querySelector('.plat-timeline')!.textContent).not.toContain('hidden-in-main-view');
    fixture.componentInstance.tab = 'audit'; fixture.detectChanges(); expect(element.querySelector('details.audit-details')!.hasAttribute('open')).toBeFalse();
  });
  it('compact tables keep overflow inside the component at the current desktop/mobile viewport', async () => {
    const fixture = await setup(PlatformPartnersPageComponent); const element = fixture.nativeElement as HTMLElement;
    const wrap = element.querySelector('.plat-table-wrap') as HTMLElement; const style = getComputedStyle(wrap);
    expect(style.overflowX).toBe('auto'); expect(element.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 2);
  });
  it('list screens distinguish initial loading, read failure, empty system and no matching results', async () => {
    for (const [type, rowsKey, readMethod] of [[PlatformPartnersPageComponent, 'partners', 'getPartners'], [PlatformCampaignsPageComponent, 'campaigns', 'getCampaigns'], [PlatformUsersPageComponent, 'users', 'getUsers']] as const) {
      const fixture = await setup(type); const page = fixture.componentInstance; const element = fixture.nativeElement as HTMLElement;
      page[rowsKey] = []; const pending = new Subject<any>(); platform[readMethod].and.returnValue(pending); page.load(); fixture.detectChanges();
      expect(element.querySelector('.plat-loading')).toBeTruthy();
      pending.error(new Error('offline')); fixture.detectChanges(); expect(element.querySelector('[role="alert"]')).toBeTruthy(); expect(element.querySelector('.plat-empty')).toBeNull();
      platform[readMethod].and.returnValue(of({ [rowsKey]: [], total: 0 })); page.searchQuery = 'אין התאמה'; page.load(); fixture.detectChanges(); expect(element.querySelector('.plat-empty')!.textContent).toContain('סינון');
      page.clearFilters(); fixture.detectChanges(); expect(element.querySelector('.plat-empty')!.textContent).toContain('עדיין אין');
    }
  });
  it('compatible campaign API enables real end dates and advanced filter controls', async () => {
    const fixture = await setup(PlatformCampaignsPageComponent);
    platform.getCampaigns.and.returnValue(of({ adminListVersion: 1, campaigns: [{ ...campaign, end_date: '2026-11-02T18:00:00Z' }], total: 1 })); fixture.componentInstance.load(); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement; expect(element.textContent).toContain('02/11/2026'); expect(element.querySelector('.campaign-dates')).toBeTruthy(); expect(element.querySelector('.progress-sort')).toBeTruthy();
  });
  it('compatible user API displays actual named affiliations in the main table', async () => {
    const fixture = await setup(PlatformUsersPageComponent);
    platform.getUsers.and.returnValue(of({ adminListVersion: 1, users: [{ ...user, entities: [{ entity_id: 'e', entity_name: 'עמותה לדוגמה', role: 'owner' }] }], total: 1 })); fixture.componentInstance.load(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody a[href="/platform/organizations/e"]')).toBeTruthy(); expect(fixture.nativeElement.querySelector('.super-admin-filter')).toBeTruthy();
  });
});

describe('Admin details drawer keyboard accessibility', () => {
  it('focuses close, traps Tab, closes on Escape and restores the trigger', async () => {
    await TestBed.configureTestingModule({ imports: [DrawerHost] }).compileComponents(); const fixture = TestBed.createComponent(DrawerHost); fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('#drawer-trigger') as HTMLButtonElement; trigger.focus(); trigger.click(); fixture.detectChanges();
    const close = fixture.nativeElement.querySelector('app-admin-details-drawer header button') as HTMLButtonElement; expect(document.activeElement).toBe(close);
    const last = fixture.nativeElement.querySelector('#drawer-last') as HTMLButtonElement; last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); expect(document.activeElement).toBe(close);
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it('does not close or emit a close event while an action is processing', async () => {
    await TestBed.configureTestingModule({ imports: [AdminDetailsDrawerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(AdminDetailsDrawerComponent); fixture.componentInstance.heading = 'בדיקה'; fixture.componentInstance.closeDisabled = true; const closed = jasmine.createSpy(); fixture.componentInstance.closed.subscribe(closed); fixture.detectChanges();
    fixture.componentInstance.requestClose(); fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); expect(closed).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('header button').disabled).toBeTrue();
  });
});
