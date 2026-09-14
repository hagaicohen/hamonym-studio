import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { PlatformGeneralSettingsPageComponent } from './platform-general-settings-page.component';
import { BillingSettingsService } from '../../services/billing-settings.service';

// VAT moved here from "חיובי עמותות" (2026-09-14j) -- it's a Hamonym
// system setting, not an association-billing concept. This is the one
// operator-facing place it can be changed; see
// platform-billing-ops-page.component.spec.ts for the paired proof that no
// editor remains there.
describe('PlatformGeneralSettingsPageComponent - חיוב ומיסוי', () => {
  async function setup(vatRate = '0.18') {
    const settingsStub = {
      get: jasmine.createSpy('get').and.returnValue(of({ setting: { vat_rate: vatRate, updated_at: '', updated_by: null } })),
      update: jasmine.createSpy('update').and.returnValue(of({ setting: { vat_rate: '0.19', updated_at: '', updated_by: 17 } })),
    };

    await TestBed.configureTestingModule({
      imports: [PlatformGeneralSettingsPageComponent],
      providers: [{ provide: BillingSettingsService, useValue: settingsStub }],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformGeneralSettingsPageComponent);
    fixture.detectChanges();
    return { fixture, settingsStub };
  }

  it('shows the current system VAT rate read-only, with the immutability note', async () => {
    const { fixture } = await setup('0.18');

    expect(fixture.debugElement.query(By.css('.gs-vat-rate')).nativeElement.textContent).toContain('18');
    expect(fixture.nativeElement.textContent).toContain('חיוב ומיסוי');
    expect(fixture.nativeElement.textContent).toContain('אינו משפיע על חיובים שכבר חושבו');
  });

  it('lets Platform Admin change the rate and calls the shared billing-settings API', async () => {
    const { fixture, settingsStub } = await setup('0.18');

    fixture.debugElement.query(By.css('.gs-vat-display button')).nativeElement.click();
    fixture.detectChanges();

    fixture.componentInstance.vatEditPercent = 19;
    fixture.debugElement.query(By.css('.ba-form-actions .ops-btn-primary')).nativeElement.click();
    fixture.detectChanges();

    expect(settingsStub.update).toHaveBeenCalledWith(0.19);
    expect(fixture.componentInstance.vatEditOpen).toBe(false);
    expect(fixture.componentInstance.systemVatRatePercent).toBe(19);
  });
});
