import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { BillingEntitySetupComponent } from './billing-entity-setup.component';
import { BillingProvisioningService } from '../../services/billing-provisioning.service';
import { BillingOpsService } from '../../services/billing-ops.service';
import { BillingSettingsService } from '../../services/billing-settings.service';

// Migrated from platform-billing-setup-page.component.spec.ts (2026-09-14h
// drawer redesign) -- all of this component's actual business logic used
// to live directly on that page; it's now hosted here instead, reachable
// either from the standalone page (route -> @Input) or a drawer (row data
// -> @Input directly, no route at all). These tests exercise the shared
// component itself, independent of either host.
describe('BillingEntitySetupComponent - entity resolution', () => {
  async function createComponent(overrides: {
    provisioning?: Record<string, any>;
    ops?: Record<string, any>;
    settings?: Record<string, any>;
    entityId?: string;
    displayNameHint?: string | null;
    donationCountHint?: number | null;
    grossAmountHint?: string | null;
  } = {}) {
    const provisioningStub = {
      getByEntityId: jasmine.createSpy('getByEntityId').and.returnValue(of({ account: null })),
      getUnprovisioned: jasmine.createSpy('getUnprovisioned'),
      create: jasmine.createSpy('create'),
      ...overrides.provisioning,
    };
    const opsStub = { getMasavConfig: () => of({ config: null }), ...overrides.ops };
    const settingsStub = {
      get: jasmine.createSpy('get').and.returnValue(of({ setting: { vat_rate: '0.18', updated_at: '', updated_by: null } })),
      ...overrides.settings,
    };

    await TestBed.configureTestingModule({
      imports: [BillingEntitySetupComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingOpsService, useValue: opsStub },
        { provide: BillingSettingsService, useValue: settingsStub },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BillingEntitySetupComponent);
    fixture.componentInstance.entityId = overrides.entityId ?? 'entity-gedolim-mehachaim';
    fixture.componentInstance.displayNameHint = overrides.displayNameHint ?? null;
    fixture.componentInstance.donationCountHint = overrides.donationCountHint ?? null;
    fixture.componentInstance.grossAmountHint = overrides.grossAmountHint ?? null;
    fixture.detectChanges();
    return { fixture, provisioningStub, opsStub };
  }

  it('resolves the given entityId and skips the unprovisioned-list fallback when the host already supplied displayName', async () => {
    const { fixture, provisioningStub } = await createComponent({
      displayNameHint: 'גדולים מהחיים',
      donationCountHint: 8,
      grossAmountHint: '207.00',
    });

    expect(provisioningStub.getByEntityId).toHaveBeenCalledWith('entity-gedolim-mehachaim');
    expect(provisioningStub.getUnprovisioned).not.toHaveBeenCalled();

    const component = fixture.componentInstance;
    expect(component.displayName).toBe('גדולים מהחיים');
    expect(component.entityId).toBe('entity-gedolim-mehachaim');
    expect(component.isBillable).toBe(false); // no billing_account yet -- matches "נדרשת הגדרת חיוב"
  });

  it('falls back to the existing getUnprovisioned() read only when no displayNameHint was supplied (e.g. a direct page reload)', async () => {
    const { fixture } = await createComponent({
      displayNameHint: null,
      provisioning: {
        getByEntityId: jasmine.createSpy('getByEntityId').and.returnValue(of({ account: null })),
        getUnprovisioned: jasmine.createSpy('getUnprovisioned').and.returnValue(
          of({
            entities: [
              {
                id: 'entity-gedolim-mehachaim',
                display_name: 'גדולים מהחיים',
                declared_billing_method: null,
                paid_donation_count: 8,
                paid_gross_total: '207.00',
              },
            ],
          }),
        ),
        create: jasmine.createSpy('create'),
      },
    });

    expect(fixture.componentInstance.displayName).toBe('גדולים מהחיים');
  });

  it('creates the billing account through the existing provisioning API with exactly this entity and shows the success banner in place (no separate "return" navigation)', async () => {
    const { fixture, provisioningStub } = await createComponent({
      displayNameHint: 'גדולים מהחיים',
      provisioning: {
        getByEntityId: jasmine.createSpy('getByEntityId').and.returnValue(of({ account: null })),
        getUnprovisioned: jasmine.createSpy('getUnprovisioned'),
        create: jasmine.createSpy('create').and.returnValue(
          of({
            account: {
              id: 'ba-1',
              entity_id: 'entity-gedolim-mehachaim',
              fee_rate: '0.03',
              vat_rate: '0.18',
              preferred_collection_method: 'card',
              enforcement_status: 'active',
              masav_ceiling: null,
              created_at: '',
              updated_at: '',
            },
          }),
        ),
      },
    });

    let createdEmitted = false;
    fixture.componentInstance.billingAccountCreated.subscribe(() => { createdEmitted = true; });

    // Clicking "שמור והפעל" itself is the confirmation (2026-09-20 -- the
    // separate "אני מאשר" checkbox was removed; the Super Admin is already
    // inside the dedicated Billing Setup flow, sees the fee rate explicitly,
    // and must click the primary action deliberately).
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(provisioningStub.create).toHaveBeenCalledTimes(1);
    const payload = provisioningStub.create.calls.mostRecent().args[0];
    expect(payload.entityId).toBe('entity-gedolim-mehachaim');
    expect(payload.preferredCollectionMethod).toBe('card');

    expect(fixture.componentInstance.justCreatedBanner).toBe(true);
    expect(fixture.componentInstance.isBillable).toBe(true);
    expect(createdEmitted).toBe(true);

    const banner = fixture.debugElement.query(By.css('.bes-success-banner'));
    expect(banner).toBeTruthy();
  });

  it('shows the current system VAT rate read-only, labeled as a system setting (2026-09-14j), and never renders a VAT input field, before or after account creation', async () => {
    const { fixture } = await createComponent({ displayNameHint: 'גדולים מהחיים' });
    fixture.detectChanges();

    expect(fixture.componentInstance.systemVatRatePercent).toBe(18);
    // Exactly one editable rate input pre-creation -- fee rate. VAT is
    // display-only text ("מע״מ ... 18% (הגדרת מערכת)"), never a second input.
    const numberInputs = fixture.debugElement.queryAll(By.css('.bes-row input[type="number"]'));
    expect(numberInputs.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('הגדרת מערכת');
    expect(fixture.nativeElement.textContent).toContain('18%');
  });

  it('the fee field defaults to 3% (Hamonym\'s standard default), "שמור והפעל" is enabled with no confirmation checkbox, and clicking it alone creates the account (2026-09-20 -- the separate "אני מאשר" checkbox was removed)', async () => {
    const { fixture, provisioningStub } = await createComponent({
      displayNameHint: 'גדולים מהחיים',
      provisioning: {
        getByEntityId: jasmine.createSpy('getByEntityId').and.returnValue(of({ account: null })),
        getUnprovisioned: jasmine.createSpy('getUnprovisioned'),
        create: jasmine.createSpy('create').and.returnValue(
          of({
            account: {
              id: 'ba-1', entity_id: 'entity-gedolim-mehachaim', fee_rate: '0.03', vat_rate: '0.18',
              preferred_collection_method: 'card', enforcement_status: 'active', masav_ceiling: null,
              created_at: '', updated_at: '',
            },
          }),
        ),
      },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.feeRatePercent).toBe(3);
    expect(fixture.debugElement.query(By.css('.bes-confirm'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('input[type="checkbox"]'))).toBeFalsy();

    const button = fixture.debugElement.query(By.css('.bes-primary-action .ops-btn-primary'));
    expect(button.nativeElement.disabled).toBe(false);

    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(provisioningStub.create).toHaveBeenCalledTimes(1);
    expect(provisioningStub.create.calls.mostRecent().args[0].feeRate).toBe(0.03);
    expect(fixture.componentInstance.justCreatedBanner).toBe(true);
  });

  it('submit() is still a no-op while already submitting or once a billing account already exists', async () => {
    const { fixture, provisioningStub } = await createComponent({ displayNameHint: 'גדולים מהחיים' });
    fixture.detectChanges();

    fixture.componentInstance.submitting = true;
    fixture.componentInstance.submit();
    expect(provisioningStub.create).not.toHaveBeenCalled();

    fixture.componentInstance.submitting = false;
    fixture.componentInstance.billingAccount = {
      id: 'ba-1', entity_id: 'x', fee_rate: '0.03', vat_rate: '0.18',
      preferred_collection_method: 'card', enforcement_status: 'active', masav_ceiling: null,
      created_at: '', updated_at: '',
    };
    fixture.componentInstance.submit();
    expect(provisioningStub.create).not.toHaveBeenCalled();
  });
});

// Regression coverage for the 2026-09-16 Billing Setup drawer redesign:
// bank details and the authorization document are two INDEPENDENT
// checklist items (each with its own compact-summary/expand toggle,
// showMasavBankEdit / showMasavDocReplace), completable in either order --
// masav-config.service.js#uploadAuthorizationDocument no longer requires
// bank details to already exist. אישור מס״ב remains the one action that
// genuinely needs both, enforced by the backend regardless of what the UI
// allows clicking.
describe('BillingEntitySetupComponent - מס״ב checklist (bank details + document, either order)', () => {
  const fullyConfigured = {
    id: 'masav-1',
    entity_id: 'entity-gedolim-mehachaim',
    bank_code: '12',
    branch_code: '345',
    account_number: '000123456',
    account_holder_name: 'עמותת גדולים מהחיים',
    authorized: false,
    authorized_by: null,
    authorized_at: null,
    authorization_document_name: 'ishur-masav.pdf',
    authorization_document_uploaded_at: '2026-09-01T10:00:00.000Z',
    has_authorization_document: true,
  };

  // A document was uploaded before bank details were ever saved -- exactly
  // the scenario the ordering-dependency fix enables. bank_code/branch_code/
  // account_number are '' (not null -- see the NOT NULL columns, migration
  // 060), never treated as "configured".
  const documentOnlyConfig = {
    id: 'masav-2',
    entity_id: 'entity-gedolim-mehachaim',
    bank_code: '',
    branch_code: '',
    account_number: '',
    account_holder_name: null,
    authorized: false,
    authorized_by: null,
    authorized_at: null,
    authorization_document_name: 'early-upload.pdf',
    authorization_document_uploaded_at: '2026-09-01T10:00:00.000Z',
    has_authorization_document: true,
  };

  async function createComponent(masavConfig: any) {
    const provisioningStub = {
      getByEntityId: jasmine.createSpy('getByEntityId').and.returnValue(
        of({ account: { id: 'ba-1', entity_id: 'entity-x', fee_rate: '0.03', vat_rate: '0.18', preferred_collection_method: 'card', enforcement_status: 'active', masav_ceiling: null, created_at: '', updated_at: '' } }),
      ),
      getUnprovisioned: jasmine.createSpy('getUnprovisioned'),
      create: jasmine.createSpy('create'),
    };
    const opsStub = { getMasavConfig: () => of({ config: masavConfig }) };
    const settingsStub = { get: () => of({ setting: { vat_rate: '0.18', updated_at: '', updated_by: null } }) };

    await TestBed.configureTestingModule({
      imports: [BillingEntitySetupComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingOpsService, useValue: opsStub },
        { provide: BillingSettingsService, useValue: settingsStub },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(BillingEntitySetupComponent);
    fixture.componentInstance.entityId = 'entity-gedolim-mehachaim';
    fixture.componentInstance.displayNameHint = 'גדולים מהחיים';
    fixture.detectChanges();
    return { fixture };
  }

  it('with existing bank details + document: shows compact summaries with ✓, no editable bank fields, no file picker -- אישור מס״ב is the only primary action', async () => {
    const { fixture } = await createComponent(fullyConfigured);

    expect(fixture.componentInstance.showMasavBankEdit).toBe(false);
    expect(fixture.componentInstance.showMasavDocReplace).toBe(false);

    expect(fixture.debugElement.query(By.css('.ba-form'))).toBeFalsy(); // no editable bank form
    expect(fixture.debugElement.query(By.css('input[type="file"]'))).toBeFalsy(); // no file picker
    expect(fixture.nativeElement.textContent).toContain('ishur-masav.pdf');

    const rows = fixture.debugElement.queryAll(By.css('.bes-checklist-row'));
    expect(rows[0].nativeElement.textContent).toContain('✓'); // bank
    expect(rows[1].nativeElement.textContent).toContain('✓'); // document
    expect(rows[2].nativeElement.textContent).toContain('○'); // not yet authorized

    const authorizeBtn = fixture.debugElement.query(By.css('.ops-btn-primary'));
    expect(authorizeBtn.nativeElement.textContent).toContain('אישור מס״ב');
    expect(authorizeBtn.nativeElement.disabled).toBe(false);
  });

  it('"עריכה" (bank) reveals the editable bank form on request, independently of the document section', async () => {
    const { fixture } = await createComponent(fullyConfigured);

    const editBtn = [...fixture.debugElement.queryAll(By.css('button'))]
      .find((b) => b.nativeElement.textContent.trim() === 'עריכה');
    editBtn!.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.showMasavBankEdit).toBe(true);
    expect(fixture.debugElement.query(By.css('.ba-form'))).toBeTruthy();
    expect(fixture.componentInstance.showMasavDocReplace).toBe(false); // untouched
  });

  it('"החלף" reveals the acknowledgement + file picker on request', async () => {
    const { fixture } = await createComponent(fullyConfigured);

    const replaceBtn = [...fixture.debugElement.queryAll(By.css('button'))]
      .find((b) => b.nativeElement.textContent.trim() === 'החלף');
    replaceBtn!.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.showMasavDocReplace).toBe(true);
    expect(fixture.debugElement.query(By.css('.bo-masav-ack'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('input[type="file"]'))).toBeTruthy();
  });

  it('with nothing configured yet: the checklist stays collapsed (no forms shown by default), each row offering its own "הוסף"/"העלה" action (2026-09-16 checklist simplification)', async () => {
    const { fixture } = await createComponent(null);

    // Neither form is auto-opened -- the operator sees the checklist first.
    expect(fixture.componentInstance.showMasavBankEdit).toBe(false);
    expect(fixture.componentInstance.showMasavDocReplace).toBe(false);
    expect(fixture.debugElement.query(By.css('.ba-form'))).toBeFalsy();
    expect(fixture.debugElement.query(By.css('input[type="file"]'))).toBeFalsy();

    const rows = fixture.debugElement.queryAll(By.css('.bes-checklist-row'));
    expect(rows[0].nativeElement.textContent).toContain('○'); // bank, not yet configured
    expect(rows[0].nativeElement.textContent).toContain('הוסף');
    expect(rows[1].nativeElement.textContent).toContain('○'); // document, not yet uploaded
    expect(rows[1].nativeElement.textContent).toContain('העלה');
    expect(rows[2].nativeElement.textContent).toContain('○'); // authorization

    // Clicking the bank row's own action reveals only the bank form.
    const addBankBtn = [...fixture.debugElement.queryAll(By.css('button'))]
      .find((b) => b.nativeElement.textContent.trim() === 'הוסף');
    addBankBtn!.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.showMasavBankEdit).toBe(true);
    expect(fixture.debugElement.query(By.css('.ba-form'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('input[type="file"]'))).toBeFalsy(); // document section untouched
  });

  // The exact scenario the ordering-dependency fix exists for.
  it('document uploaded before bank details: document reads ✓ while bank details read ○ -- and the file picker was never gated on bank details existing', async () => {
    const { fixture } = await createComponent(documentOnlyConfig);

    expect(fixture.componentInstance.masavBankConfigured).toBe(false);
    expect(fixture.componentInstance.masavDocumentUploaded).toBe(true);

    // Both sections start collapsed -- document shows its compact ✓
    // summary, bank shows its collapsed ○ row with "הוסף" (not an
    // auto-opened form).
    expect(fixture.componentInstance.showMasavDocReplace).toBe(false);
    expect(fixture.componentInstance.showMasavBankEdit).toBe(false);
    expect(fixture.debugElement.query(By.css('.ba-form'))).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('early-upload.pdf');

    const rows = fixture.debugElement.queryAll(By.css('.bes-checklist-row'));
    expect(rows[0].nativeElement.textContent).toContain('○'); // bank
    expect(rows[0].nativeElement.textContent).toContain('הוסף');
    expect(rows[1].nativeElement.textContent).toContain('✓'); // document

    // The underlying "what's missing" fact is unchanged -- only its
    // presentation (no more permanent banner) moved to the checklist rows.
    expect(fixture.componentInstance.masavSetupSummary).toContain('פרטי חשבון');
    expect(fixture.componentInstance.masavSetupSummary).not.toContain('מסמך הרשאה');

    // אישור מס״ב stays disabled with an explanation naming what's missing.
    const authorizeBtn = fixture.debugElement.query(By.css('.ops-btn-primary'));
    expect(authorizeBtn.nativeElement.disabled).toBe(true);
    expect(fixture.componentInstance.masavAuthorizationBlockedReason).toContain('פרטי חשבון');
  });

  it('bank details saved before any document: bank details read ✓ while the document section offers its own "העלה" action, independent of bank details', async () => {
    const { fixture } = await createComponent({
      id: 'masav-3', entity_id: 'entity-gedolim-mehachaim',
      bank_code: '12', branch_code: '345', account_number: '000123456', account_holder_name: 'שם',
      authorized: false, authorized_by: null, authorized_at: null,
      authorization_document_name: null, authorization_document_uploaded_at: null, has_authorization_document: false,
    });

    expect(fixture.componentInstance.masavBankConfigured).toBe(true);
    expect(fixture.componentInstance.masavDocumentUploaded).toBe(false);
    expect(fixture.componentInstance.showMasavBankEdit).toBe(false); // compact summary
    expect(fixture.componentInstance.showMasavDocReplace).toBe(false); // collapsed, not auto-opened

    const rows = fixture.debugElement.queryAll(By.css('.bes-checklist-row'));
    expect(rows[1].nativeElement.textContent).toContain('○');
    expect(rows[1].nativeElement.textContent).toContain('העלה');

    // Clicking "העלה" reveals the picker -- enabled purely by the ack
    // checkbox, no dependency on bank details being configured.
    const uploadBtn = [...fixture.debugElement.queryAll(By.css('button'))]
      .find((b) => b.nativeElement.textContent.trim() === 'העלה');
    uploadBtn!.nativeElement.click();
    fixture.detectChanges();

    const fileInput: HTMLInputElement = fixture.debugElement.query(By.css('input[type="file"]')).nativeElement;
    expect(fileInput.disabled).toBe(true); // ack not yet checked
    fixture.componentInstance.masavAckChecked = true;
    fixture.detectChanges();
    expect(fileInput.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('לשמור פרטי חשבון'); // the old blocking note is gone
  });

  it('authorizeMasav() itself (not just the button) refuses when either prerequisite is missing, matching the disabled state', async () => {
    const { fixture } = await createComponent(documentOnlyConfig);

    fixture.componentInstance.authorizeMasav();
    fixture.detectChanges();

    // Guarded before any network call: masavActionBusy would flip to true
    // immediately upon a real call proceeding.
    expect(fixture.componentInstance.masavActionBusy).toBe(false);
    expect(fixture.componentInstance.masavActionError).toBeNull();
  });
});
