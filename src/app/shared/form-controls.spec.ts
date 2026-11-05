import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-openfields-form', standalone: true,
  template: '<input class="exp-input" aria-label="provider expiry" />',
  styleUrls: ['../modules/billing/components/openfields-form/openfields-form.component.css'],
})
class ProviderFixture {}

@Component({
  standalone: true, imports: [ReactiveFormsModule, ProviderFixture],
  template: `
  <section dir="rtl" class="control-test" style="max-width:100%;width:700px">
    <form [formGroup]="form" (ngSubmit)="submits = submits + 1" class="form-group">
      <label for="name">שם</label>
      <input id="name" class="base-input cv2-field-input" formControlName="name" aria-describedby="name-error" />
      @if (form.controls.name.invalid && (form.controls.name.touched || submits)) {
        <p id="name-error" class="field-error">נא להשלים את השדה</p>
      }
      <textarea aria-label="תיאור" formControlName="description"></textarea>
      <select aria-label="בחירה" formControlName="choice"><option value="">בחרו</option><option value="a">א</option></select>
      <input aria-label="תאריך" type="date" formControlName="date" />
      <input id="valid" class="cv2-field-input cv2-field-valid" value="תקין" />
      <input id="custom-error" class="field-input field-error" aria-invalid="true" value="שגיאה" />
      <input id="disabled" disabled value="מושבת" />
      <input id="readonly" readonly value="קריא" />
      <button type="submit">שמירה</button>
    </form>
    <div class="url-field-wrapper" [class.invalid]="urlInvalid">
      <span class="url-prefix">hamonym.org/</span><input class="url-input" aria-label="כתובת" />
    </div>
    <label class="rf-switch"><input type="checkbox" aria-label="מתג" /><span class="rf-slider"></span></label>
    <label class="tse-switch"><input type="checkbox" aria-label="מתג עורך" /><span class="tse-switch-slider"></span></label>
    <input type="checkbox" id="checkbox" aria-label="סימון" />
    <input type="radio" id="radio" aria-label="אפשרות" />
    <input type="file" id="file" aria-label="קובץ" />
    <input type="color" id="color" aria-label="צבע" />
    <input type="range" id="range" aria-label="טווח" />
    <input type="hidden" id="hidden" />
    <app-openfields-form />
  </section>`,
  styleUrls: [
    '../modules/organization-registration/components/step-profile/step-profile.component.css',
    '../modules/auth/pages/register/register.component.css',
    '../modules/campaigns/shared/components/checkout-v2/checkout-v2.component.css',
    '../modules/campaigns/shared/components/checkout-modal/checkout-modal.component.css',
    '../modules/campaigns/builder/steps/campaign-basic-step/campaign-basic-step.component.css',
    '../modules/campaigns/pages/campaign-rewards-page/campaign-rewards-page.component.css',
    './ui/style-role-editor/style-role-editor.component.css',
  ],
})
class ControlsFixture {
  submits = 0;
  urlInvalid = false;
  form = new FormGroup({
    name: new FormControl('', Validators.required),
    description: new FormControl('', Validators.required),
    choice: new FormControl('', Validators.required),
    date: new FormControl('', Validators.required),
  });
}

describe('Shared form control rendering in Chrome', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ControlsFixture>>;
  let noTransitions: HTMLStyleElement;
  const neutral = 'rgb(203, 213, 225)', purple = 'rgb(109, 40, 217)', red = 'rgb(185, 28, 28)';
  const find = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
  const style = (selector: string) => getComputedStyle(find(selector));
  beforeEach(() => {
    noTransitions = document.createElement('style');
    noTransitions.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.appendChild(noTransitions);
    fixture = TestBed.createComponent(ControlsFixture); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); noTransitions.remove(); });
  it('keeps untouched required fields neutral with no premature error message', () => {
    expect(fixture.componentInstance.form.invalid).toBeTrue();
    expect(style('#name').borderTopColor).toBe(neutral);
    expect(find('#name-error')).toBeNull();
  });
  for (const selector of ['#name', 'textarea', 'select', 'input[type=date]']) {
    it(`uses one purple focus border for ${selector}`, () => {
      find(selector).focus();
      expect(style(selector).borderTopColor).toBe(purple);
      expect(style(selector).boxShadow).toBe('none');
      expect(style(selector).outlineStyle).toBe('none');
    });
    it(`keeps invalid + focus red for ${selector}`, () => {
      fixture.componentInstance.form.markAllAsTouched(); fixture.detectChanges(); find(selector).focus();
      expect(style(selector).borderTopColor).toBe(red);
      expect(style(selector).boxShadow).toBe('none');
      expect(style(selector).outlineStyle).toBe('none');
    });
  }
  it('returns to neutral after correction and never applies a green valid border', () => {
    const control = fixture.componentInstance.form.controls.name;
    control.markAsTouched(); fixture.detectChanges();
    expect(style('#name').borderTopColor).toBe(red);
    control.setValue('שם תקין'); fixture.detectChanges();
    expect(style('#name').borderTopColor).toBe(neutral);
    expect(style('#valid').borderTopColor).toBe(neutral);
    expect(style('#valid').boxShadow).toBe('none');
    expect(find('#name-error')).toBeNull();
  });
  it('shows existing validation errors on submit without changing validators or values', () => {
    find('button[type=submit]').click(); fixture.detectChanges();
    expect(fixture.componentInstance.submits).toBe(1);
    expect(style('#name').borderTopColor).toBe(red);
    expect(find('#name-error').textContent).toContain('נא להשלים');
    expect(fixture.componentInstance.form.controls.name.value).toBe('');
  });
  it('responds to dynamic validator changes and reset', () => {
    const control = fixture.componentInstance.form.controls.name;
    control.markAsTouched(); control.clearValidators(); control.updateValueAndValidity(); fixture.detectChanges();
    expect(style('#name').borderTopColor).toBe(neutral);
    control.addValidators(Validators.required); control.updateValueAndValidity(); fixture.detectChanges();
    expect(style('#name').borderTopColor).toBe(red);
    fixture.componentInstance.form.reset(); fixture.detectChanges();
    expect(style('#name').borderTopColor).toBe(neutral);
  });
  it('honors explicit server/custom validation even while focused', () => {
    find('#custom-error').focus();
    expect(style('#custom-error').borderTopColor).toBe(red);
    expect(style('#custom-error').outlineStyle).toBe('none');
  });
  it('distinguishes disabled and readonly without reducing text opacity', () => {
    expect(style('#disabled').backgroundColor).toBe('rgb(241, 245, 249)');
    expect(style('#disabled').cursor).toBe('not-allowed');
    expect(style('#readonly').backgroundColor).toBe('rgb(248, 250, 252)');
    expect(style('#readonly').opacity).toBe('1');
    expect((find('#readonly') as HTMLInputElement).readOnly).toBeTrue();
  });
  it('puts the only border on composite URL wrappers, including focused errors', () => {
    find('.url-input').focus();
    expect(style('.url-input').borderTopWidth).toBe('0px');
    expect(style('.url-input').outlineStyle).toBe('none');
    expect(style('.url-field-wrapper').borderTopColor).toBe(purple);
    fixture.componentInstance.urlInvalid = true; fixture.detectChanges();
    expect(style('.url-field-wrapper').borderTopColor).toBe(red);
  });
  it('keeps compact native choices and keyboard-accessible custom switches', () => {
    expect(style('#checkbox').height).toBe('16px');
    expect(style('#radio').height).toBe('16px');
    find('.tse-switch input').focus();
    expect(document.activeElement).toBe(find('.tse-switch input'));
    expect(style('.tse-switch-slider').outlineStyle).toBe('solid');
    expect(style('.tse-switch-slider').outlineWidth).toBe('2px');
  });
  it('preserves provider-owned expiry fields and their original focus appearance', () => {
    const selector = 'app-openfields-form .exp-input'; find(selector).focus();
    expect(style(selector).height).toBe(window.innerWidth <= 768 ? '56px' : '58px');
    expect(style(selector).borderTopColor).toBe('rgb(37, 99, 235)');
    expect(style(selector).boxShadow).not.toBe('none');
  });
  it('preserves special input types and hidden fields', () => {
    expect(style('#hidden').display).toBe('none');
    for (const type of ['file', 'color', 'range']) expect((find('#' + type) as HTMLInputElement).type).toBe(type);
    expect(style('#file').maxWidth).toBe('100%');
  });
  it('keeps RTL, multiline controls and dialog-sized layouts within their container', () => {
    const container = find('.control-test'); container.style.width = '320px';
    expect(getComputedStyle(container).direction).toBe('rtl');
    for (const selector of ['#name', 'textarea', 'select']) {
      expect(find(selector).getBoundingClientRect().width).toBeLessThanOrEqual(container.clientWidth);
    }
    expect(parseFloat(style('textarea').height)).toBeGreaterThanOrEqual(96);
    expect(style('#name').fontSize).toBe(window.innerWidth <= 640 ? '16px' : '14px');
  });
});
