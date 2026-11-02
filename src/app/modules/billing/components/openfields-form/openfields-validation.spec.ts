import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OpenfieldsFormComponent } from './openfields-form.component';

describe('CardCom secure-field validation before submission', () => {
  let component: OpenfieldsFormComponent;
  let frame: HTMLIFrameElement;
  let post: jasmine.Spy;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OpenfieldsFormComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    TestBed.overrideComponent(OpenfieldsFormComponent, { set: { template: '' } });
    component = TestBed.createComponent(OpenfieldsFormComponent).componentInstance;
    component.lowProfileId = 'fixture'; component.initState = 'initialized';
    (component as any).donationMode = true;
    frame = document.createElement('iframe'); frame.id = 'CardComMasterFrame'; document.body.appendChild(frame);
    post = spyOn(frame.contentWindow!, 'postMessage');
    spyOn(console, 'error');
  });
  afterEach(() => { component.ngOnDestroy(); frame.remove(); });
  const origin = 'https://secure.cardcom.solutions';
  function validate(field: string, isValid: boolean, trusted = true): void {
    (component as any).onMessage(new MessageEvent('message', {
      origin: trusted ? origin : 'https://example.invalid', source: frame.contentWindow,
      data: { action: 'handleValidations', field, isValid },
    }));
  }
  function response(data: object): void {
    window.dispatchEvent(new MessageEvent('message', { origin, source: frame.contentWindow, data }));
  }
  it('blocks an incomplete card without submitting a transaction', async () => {
    const result = component.tokenize(); validate('cardNumber', false);
    expect(await result).toBeFalse(); expect(component.submissionBlocked).toBeTrue();
    expect(component.validationError).toContain('יש להשלים את כל הספרות');
    expect(post.calls.allArgs().map(args => args[0].action)).toEqual(['validateCardNumber', 'validateCvv']);
  });
  it('shows provider blur validation even before submission', () => {
    validate('cardNumber', false);
    expect(component.validationError).toContain('מספר הכרטיס');
    expect(post).not.toHaveBeenCalled();
  });
  it('allows correction and another submission after an invalid card', async () => {
    const first = component.tokenize(); validate('cardNumber', false);
    expect(await first).toBeFalse();
    const retry = component.tokenize(); validate('cardNumber', true); validate('cvv', true);
    await Promise.resolve();
    expect(component.validationError).toBe('');
    expect(post.calls.allArgs().filter(args => args[0].action === 'doTransaction').length).toBe(1);
    response({ action: 'HandleSubmit', data: { IsSuccess: true } });
    expect(await retry).toBeTrue();
  });
  it('blocks invalid CVV before a transaction', async () => {
    const result = component.tokenize(); validate('cardNumber', true); validate('cvv', false);
    expect(await result).toBeFalse(); expect(component.validationError).toContain('CVV');
    expect(post.calls.count()).toBe(2);
  });
  for (const action of ['HandleSubmit', 'HandleEror', 'HandleError']) {
    for (const scenario of [
      { ResponseCode: 400, Description: 'מספר כרטיס לא תקין', expected: 'מספר הכרטיס' },
      { ResponseCode: 400, Description: 'תאריך תוקף שגוי', expected: 'תוקף הכרטיס' },
      { ResponseCode: 333, Description: '3DS אימות נכשל', expected: 'אימות התשלום נדחה' },
    ]) {
      it(`recovers from ${action} provider rejection ${scenario.ResponseCode}: ${scenario.expected}`, async () => {
        const result = component.tokenize(); validate('cardNumber', true); validate('cvv', true); await Promise.resolve();
        const data = { IsSuccess: false, ...scenario };
        response(action === 'HandleSubmit' ? { action, lowProfileCode: 'fixture', data }
          : { action, lowProfileCode: 'fixture', ResponseCode: scenario.ResponseCode, message: scenario.Description });
        expect(await result).toBeFalse(); expect(component.submissionBlocked).toBeTrue();
        expect(component.validationError).toContain(scenario.expected);
      });
    }
  }
  it('does not unlock a transport error or expose its raw description', async () => {
    const result = component.tokenize(); validate('cardNumber', true); validate('cvv', true); await Promise.resolve();
    response({ action: 'HandleError', ResponseCode: 500, message: 'sensitive provider data' });
    expect(await result).toBeFalse(); expect(component.submissionBlocked).toBeFalse();
    expect(component.validationError).not.toContain('sensitive');
  });
  it('requires both provider validations and ignores untrusted messages', async () => {
    const result = component.tokenize(); validate('cardNumber', true, false); validate('cvv', true);
    await Promise.resolve(); expect(post.calls.count()).toBe(2);
    validate('cardNumber', true); await Promise.resolve();
    expect(post.calls.mostRecent().args[0].action).toBe('doTransaction');
    response({ action: 'HandleSubmit', data: { IsSuccess: true } });
    expect(await result).toBeTrue(); expect(component.submissionBlocked).toBeFalse();
  });
  it('fails closed on a validation timeout without classifying a payment as declined', fakeAsync(() => {
    let result: boolean | undefined; component.tokenize().then(value => result = value);
    tick(3000); flushMicrotasks(); expect(result).toBeFalse();
    expect(component.submissionBlocked).toBeTrue(); expect(post.calls.count()).toBe(2);
    expect(component.validationError).toContain('לא ניתן לאמת');
  }));
  for (const action of ['HandleEror', 'HandleError']) {
    it(`recognizes the deployed SDK invalid-card response without IsInputError for ${action}`, async () => {
      const result = component.tokenize(); validate('cardNumber', true); validate('cvv', true); await Promise.resolve();
      response({ action, lowProfileCode: 'fixture', ResponseCode: 400, message: 'מספר כרטיס לא תקין' });
      expect(await result).toBeFalse(); expect(component.submissionBlocked).toBeTrue();
      expect(component.validationError).toContain('יש להשלים את כל הספרות');
      expect(component.validationError).not.toContain('אישור סופי');
      const retry = component.tokenize(); validate('cardNumber', true); validate('cvv', true);
      await Promise.resolve();
      response({ action: 'HandleSubmit', data: { IsSuccess: true } });
      expect(await retry).toBeTrue();
      expect(component.validationError).toBe('');
    });

    it(`does not unlock an arbitrary or stale provider error for ${action}`, async () => {
      const result = component.tokenize(); validate('cardNumber', true); validate('cvv', true); await Promise.resolve();
      response({ action, lowProfileCode: 'previous-profile', ResponseCode: 400, message: 'מספר כרטיס לא תקין' });
      expect(await result).toBeFalse(); expect(component.submissionBlocked).toBeFalse();
      expect(component.validationError).toContain('אין לשלם שוב');
    });

    it(`allows correction for an explicit provider input error from ${action}`, async () => {
      const result = component.tokenize(); validate('cardNumber', true); validate('cvv', true); await Promise.resolve();
      response({ action, IsInputError: true, message: 'unsafe provider payload' });
      expect(await result).toBeFalse(); expect(component.submissionBlocked).toBeTrue();
      expect(component.validationError).toContain('פרטי האשראי אינם תקינים');
      expect(component.validationError).not.toContain('unsafe');
    });
  }
});

describe('OpenFields visible validation feedback', () => {
  it('renders the provider field error in the original form', () => {
    TestBed.configureTestingModule({ imports: [OpenfieldsFormComponent, HttpClientTestingModule], providers: [provideRouter([])] });
    spyOn(OpenfieldsFormComponent.prototype, 'ngOnInit').and.resolveTo();
    const fixture = TestBed.createComponent(OpenfieldsFormComponent);
    fixture.detectChanges();
    const frame = fixture.nativeElement.querySelector('#CardComMasterFrame') as HTMLIFrameElement;
    (fixture.componentInstance as any).onMessage(new MessageEvent('message', {
      origin: 'https://secure.cardcom.solutions', source: frame.contentWindow,
      data: { action: 'handleValidations', field: 'cardNumber', isValid: false },
    }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('מספר הכרטיס אינו מלא');
    expect(fixture.nativeElement.querySelector('#CardComCardNumber')).not.toBeNull();
    fixture.destroy();
  });
});
