import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { PlatformBillingSetupPageComponent } from './platform-billing-setup-page.component';
import { BillingProvisioningService } from '../../services/billing-provisioning.service';
import { BillingOpsService } from '../../services/billing-ops.service';

// Exercises the entity-resolution half of the acceptance-criterion
// workflow: given the route this screen is actually reached with
// (/platform/billing-setup/:entityId?displayName=...&donationCount=...),
// it must resolve to exactly that entity, render its name immediately (no
// extra round trip needed when Billing Ops already supplied it), and reuse
// the existing provisioning create() API -- never a parallel implementation.
describe('PlatformBillingSetupPageComponent - entity resolution', () => {
  function activatedRouteFor(entityId: string, queryParams: Record<string, string> = {}) {
    return {
      snapshot: {
        paramMap: { get: (key: string) => (key === 'entityId' ? entityId : null) },
        queryParamMap: { get: (key: string) => queryParams[key] ?? null },
      },
    };
  }

  it('resolves entityId from the route path segment and skips the unprovisioned-list fallback when Billing Ops already supplied displayName', async () => {
    const getUnprovisionedSpy = jasmine.createSpy('getUnprovisioned');
    const provisioningStub = {
      getByEntityId: jasmine.createSpy('getByEntityId').and.returnValue(of({ account: null })),
      getUnprovisioned: getUnprovisionedSpy,
      create: jasmine.createSpy('create'),
    };
    const opsStub = { getMasavConfig: () => of({ config: null }) };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingSetupPageComponent],
      providers: [
        provideRouter([]),
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingOpsService, useValue: opsStub },
        {
          provide: ActivatedRoute,
          useValue: activatedRouteFor('entity-gedolim-mehachaim', {
            displayName: 'גדולים מהחיים',
            donationCount: '8',
            grossAmount: '207.00',
          }),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingSetupPageComponent);
    fixture.detectChanges();

    expect(provisioningStub.getByEntityId).toHaveBeenCalledWith('entity-gedolim-mehachaim');
    expect(getUnprovisionedSpy).not.toHaveBeenCalled();

    const title = fixture.debugElement.query(By.css('.plat-title'));
    expect(title.nativeElement.textContent).toContain('גדולים מהחיים');

    const component = fixture.componentInstance;
    expect(component.entityId).toBe('entity-gedolim-mehachaim');
    expect(component.isBillable).toBe(false); // no billing_account yet -- matches "נדרשת הגדרת חיוב"
  });

  it('falls back to the existing getUnprovisioned() read only when the route arrives without displayName (e.g. a direct reload)', async () => {
    const provisioningStub = {
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
    };
    const opsStub = { getMasavConfig: () => of({ config: null }) };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingSetupPageComponent],
      providers: [
        provideRouter([]),
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingOpsService, useValue: opsStub },
        { provide: ActivatedRoute, useValue: activatedRouteFor('entity-gedolim-mehachaim') },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingSetupPageComponent);
    fixture.detectChanges();

    expect(provisioningStub.getUnprovisioned).toHaveBeenCalled();
    expect(fixture.componentInstance.displayName).toBe('גדולים מהחיים');
  });

  it('creates the billing account through the existing provisioning API with exactly this entity and returns to Billing Ops carrying the entity along', async () => {
    const provisioningStub = {
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
    };
    const opsStub = { getMasavConfig: () => of({ config: null }) };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingSetupPageComponent],
      providers: [
        provideRouter([]),
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingOpsService, useValue: opsStub },
        {
          provide: ActivatedRoute,
          useValue: activatedRouteFor('entity-gedolim-mehachaim', { displayName: 'גדולים מהחיים' }),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingSetupPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(provisioningStub.create).toHaveBeenCalledTimes(1);
    const payload = provisioningStub.create.calls.mostRecent().args[0];
    expect(payload.entityId).toBe('entity-gedolim-mehachaim');

    expect(fixture.componentInstance.justCreated).toBe(true);
    expect(fixture.componentInstance.isBillable).toBe(true);

    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');
    fixture.componentInstance.returnToBillingOps();
    expect(navigateSpy).toHaveBeenCalledWith(['/platform/billing-ops'], {
      queryParams: { justSetupEntity: 'entity-gedolim-mehachaim', justSetupName: 'גדולים מהחיים' },
    });
  });
});
