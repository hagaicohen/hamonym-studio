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

    // Explicit operator confirmation is the actual gate -- submit() is a
    // no-op without it, mirroring the disabled primary button in the
    // template. See the Billing-provisioning readiness correction
    // (2026-09-02) this behavior exists to close.
    fixture.componentInstance.confirmed = true;
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

  it('shows the current system VAT rate read-only (2026-09-14i) and never renders a VAT input field, before or after account creation', async () => {
    const { fixture } = await createComponent({ displayNameHint: 'גדולים מהחיים' });
    fixture.detectChanges();

    expect(fixture.componentInstance.systemVatRatePercent).toBe(18);
    // Exactly one editable rate input pre-creation -- fee rate. VAT is
    // display-only text (the "מע״מ נוכחי במערכת" row), never a second input.
    const numberInputs = fixture.debugElement.queryAll(By.css('.bes-row input[type="number"]'));
    expect(numberInputs.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('מע״מ נוכחי במערכת');
    expect(fixture.nativeElement.textContent).toContain('18%');
  });

  it('does not create a billing account when the operator has not confirmed the commercial terms', async () => {
    const { fixture, provisioningStub } = await createComponent({ displayNameHint: 'גדולים מהחיים' });

    expect(fixture.componentInstance.confirmed).toBe(false);

    const button = fixture.debugElement.query(By.css('.bes-primary-action .ops-btn-primary'));
    expect(button.nativeElement.disabled).toBe(true);

    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(provisioningStub.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.justCreatedBanner).toBe(false);
  });
});
