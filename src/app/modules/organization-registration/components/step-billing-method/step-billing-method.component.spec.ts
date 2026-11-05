import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StepBillingMethodComponent } from './step-billing-method.component';
import { OrganizationRegistrationStateService } from '../../services/organization-registration-state.service';
import { BillingService } from '../../services/billing.service';

describe('StepBillingMethodComponent — MASAV signed mandate', () => {
  let billing: jasmine.SpyObj<BillingService>;

  function setup(config: any) {
    billing = jasmine.createSpyObj('BillingService', ['getMasavConfig', 'uploadMasavAuthorizationDocument']);
    billing.getMasavConfig.and.returnValue(of({ config }) as any);
    const state = { entityId: 'e-1', paymentMethod: 'masav', continueLater: false } as any;
    TestBed.configureTestingModule({
      imports: [StepBillingMethodComponent],
      providers: [
        { provide: BillingService, useValue: billing },
        { provide: OrganizationRegistrationStateService, useValue: { state: () => state, updateState: () => {}, save: () => of({}) } },
      ],
    });
    const fixture = TestBed.createComponent(StepBillingMethodComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the download link and the upload button', () => {
    const { el } = setup(null);
    expect(el.querySelector('.download-button')?.textContent).toContain('הורד טופס הוראת קבע');
    expect(el.querySelector('label.upload-button input[type=file]')).not.toBeNull();
    expect(billing.getMasavConfig).toHaveBeenCalledWith('e-1');
  });

  it('uploads the selected file through the real endpoint and shows it', () => {
    const { fixture, el } = setup(null);
    const file = new File(['x'], 'mandate.pdf', { type: 'application/pdf' });
    billing.uploadMasavAuthorizationDocument.and.returnValue(of({
      config: { has_authorization_document: true, authorization_document_name: 'mandate.pdf', authorized: false },
    }) as any);
    const input = el.querySelector('label.upload-button input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(billing.uploadMasavAuthorizationDocument).toHaveBeenCalledWith('e-1', file);
    expect(el.querySelector('.upload-success')?.textContent).toContain('mandate.pdf');
    expect(el.querySelector('.masav-doc-status')?.textContent).toContain('ממתינה לאישור');
  });

  it('after reload, shows the persisted document and its approved status', () => {
    const { el } = setup({ has_authorization_document: true, authorization_document_name: 'signed.pdf', authorized: true });
    expect(el.querySelector('.upload-success')?.textContent).toContain('signed.pdf');
    expect(el.querySelector('.masav-doc-status')?.textContent).toContain('ההרשאה אושרה');
    expect(el.querySelector('label.upload-button')?.textContent).toContain('החלפת הטופס החתום');
  });

  it('keeps the credit-card option', () => {
    const { el } = setup(null);
    const titles = Array.from(el.querySelectorAll('.method-title')).map(n => n.textContent!.trim());
    expect(titles).toEqual(['כרטיס אשראי', 'הוראת קבע (מס״ב)']);
  });
});
