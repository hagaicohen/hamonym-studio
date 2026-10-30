import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PlatformGeneralSettingsPageComponent } from './platform-general-settings-page.component';
import { BillingSettingsService } from '../../services/billing-settings.service';

describe('persistent MASAV consolidation setting', () => {
  async function setup(mode?: 'entity' | 'period') {
    const settings = { get: jasmine.createSpy().and.returnValue(of({ setting: { vat_rate: '.18', masav_consolidation_mode: mode } })),
      updateMasavConsolidation: jasmine.createSpy().and.returnValue(of({ setting: { vat_rate: '.18', masav_consolidation_mode: 'period' } })) };
    await TestBed.configureTestingModule({ imports: [PlatformGeneralSettingsPageComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: BillingSettingsService, useValue: settings }] }).compileComponents();
    const fixture = TestBed.createComponent(PlatformGeneralSettingsPageComponent);
    spyOn(fixture.componentInstance, 'loadClockStatus'); spyOn(fixture.componentInstance, 'loadCampaigns'); fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, settings };
  }
  it('loads the persisted default and saves period mode without touching VAT or earlier exports', async () => {
    const { fixture, component, settings } = await setup('entity'); expect(component.masavMode).toBe('entity');
    expect(fixture.nativeElement.textContent).toContain('אופן איחוד חובות למס״ב'); component.masavMode = 'period'; component.saveMasavMode();
    expect(settings.updateMasavConsolidation).toHaveBeenCalledOnceWith('period'); expect(component.systemVatRatePercent).toBe(18); expect(component.masavSaved).toBeTrue();
  });
  it('does not assume a persisted default when the deployed schema has not been updated', async () => {
    const { component, settings } = await setup(); expect(component.masavMode).toBeNull(); component.saveMasavMode(); expect(settings.updateMasavConsolidation).not.toHaveBeenCalled();
  });
  it('reports failed persistence instead of claiming the setting was saved', async () => {
    const { component, settings } = await setup('entity'); settings.updateMasavConsolidation.and.returnValue(throwError(() => new Error('unavailable')));
    component.masavMode = 'period'; component.saveMasavMode(); expect(component.masavSaved).toBeFalse(); expect(component.masavSaveBusy).toBeFalse(); expect(component.masavSaveError).toBeTruthy();
  });
});
