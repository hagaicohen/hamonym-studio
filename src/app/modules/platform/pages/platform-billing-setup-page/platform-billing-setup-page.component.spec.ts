import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PlatformBillingSetupPageComponent } from './platform-billing-setup-page.component';
import { BillingProvisioningService } from '../../services/billing-provisioning.service';
import { BillingOpsService } from '../../services/billing-ops.service';

// This page is now just a thin route wrapper around BillingEntitySetupComponent
// (2026-09-14h drawer redesign) -- kept only for deep-link compatibility.
// All the actual entity-resolution/billing/MASAV behavior is tested directly
// on that component (billing-entity-setup.component.spec.ts); this only
// proves the page reads its route correctly and hands it to the child as
// inputs.
describe('PlatformBillingSetupPageComponent - route wrapper', () => {
  function activatedRouteFor(entityId: string, queryParams: Record<string, string> = {}) {
    return {
      snapshot: {
        paramMap: { get: (key: string) => (key === 'entityId' ? entityId : null) },
        queryParamMap: { get: (key: string) => queryParams[key] ?? null },
      },
    };
  }

  it('reads entityId from the route path segment and displayName/donationCount/grossAmount from query params, passing them to the shared component', async () => {
    const provisioningStub = {
      getByEntityId: jasmine.createSpy('getByEntityId').and.returnValue(of({ account: null })),
      getUnprovisioned: jasmine.createSpy('getUnprovisioned'),
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

    const component = fixture.componentInstance;
    expect(component.entityId).toBe('entity-gedolim-mehachaim');
    expect(component.displayName).toBe('גדולים מהחיים');
    expect(component.donationCount).toBe(8);
    expect(component.grossAmount).toBe('207.00');

    const title = fixture.debugElement.query(By.css('.plat-title'));
    expect(title.nativeElement.textContent).toContain('גדולים מהחיים');

    expect(provisioningStub.getByEntityId).toHaveBeenCalledWith('entity-gedolim-mehachaim');
  });

  it('shows an error card instead of the shared component when the route has no entityId', async () => {
    const provisioningStub = {
      getByEntityId: jasmine.createSpy('getByEntityId'),
      getUnprovisioned: jasmine.createSpy('getUnprovisioned'),
      create: jasmine.createSpy('create'),
    };
    const opsStub = { getMasavConfig: () => of({ config: null }) };

    await TestBed.configureTestingModule({
      imports: [PlatformBillingSetupPageComponent],
      providers: [
        provideRouter([]),
        { provide: BillingProvisioningService, useValue: provisioningStub },
        { provide: BillingOpsService, useValue: opsStub },
        { provide: ActivatedRoute, useValue: activatedRouteFor('') },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformBillingSetupPageComponent);
    fixture.detectChanges();

    expect(provisioningStub.getByEntityId).not.toHaveBeenCalled();
    const error = fixture.debugElement.query(By.css('.plat-error'));
    expect(error).toBeTruthy();
  });
});
