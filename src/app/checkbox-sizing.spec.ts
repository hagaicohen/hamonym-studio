import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

@Component({
 standalone: true,
 template: `<label class="native"><input type="checkbox" /> Native checkbox</label>
 <label class="rf-switch"><input type="checkbox" /><span class="rf-slider"></span></label>
 <label class="tse-switch"><input type="checkbox" /><span></span></label>
 <input type="text" aria-label="text input" />`,
 styleUrls: [
  './modules/campaigns/pages/campaign-rewards-page/campaign-rewards-page.component.css',
  './shared/ui/style-role-editor/style-role-editor.component.css',
 ],
})
class CheckboxSizingFixture {}

describe('Global checkbox sizing regression', () => {
 it('keeps regular checkboxes compact while text inputs retain their dimensions', () => {
  const fixture = TestBed.createComponent(CheckboxSizingFixture); fixture.detectChanges();
  const checkbox = fixture.nativeElement.querySelector('.native input') as HTMLInputElement;
  expect(getComputedStyle(checkbox).width).toBe('16px');
  expect(getComputedStyle(checkbox).height).toBe('16px');
  expect(getComputedStyle(fixture.nativeElement.querySelector('input[type=text]')).height).toBe('48px');
  fixture.nativeElement.querySelector('.native').click(); expect(checkbox.checked).toBeTrue();
  fixture.destroy();
 });
 it('preserves custom switches with hidden inputs', () => {
  const fixture = TestBed.createComponent(CheckboxSizingFixture); fixture.detectChanges();
  const toggle = fixture.nativeElement.querySelector('.rf-switch input');
  expect(getComputedStyle(toggle).width).toBe('0px');
  expect(getComputedStyle(toggle).height).toBe('0px');
  expect(getComputedStyle(toggle).opacity).toBe('0');
  const accessibleToggle = fixture.nativeElement.querySelector('.tse-switch input');
  expect(getComputedStyle(accessibleToggle).display).not.toBe('none');
  expect(getComputedStyle(accessibleToggle).opacity).toBe('0');
  fixture.destroy();
 });
});
